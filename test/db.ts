/**
 * Testler için gömülü Postgres (PGlite).
 *
 * Supabase'in üretimde sağladığı iki şeyi burada taklit ediyoruz:
 *   1. `auth` şeması — auth.users tablosu ve auth.uid() fonksiyonu.
 *      auth.uid() üretimdeki gibi `request.jwt.claims` GUC'undan okur.
 *   2. `anon` / `authenticated` / `service_role` rolleri.
 *
 * Tablo yetkileri BURADA VERİLMEZ — 0005_yetkiler.sql migration'ından gelir.
 * Böylece testler üretimde geçerli olan yetkilerin aynısını doğrular.
 *
 * Böylece RLS politikaları GERÇEKTEN test edilir: testler `set role authenticated`
 * ile çalışır, dolayısıyla tablo sahibi olmadıkları için RLS'e tabidirler.
 */

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

const AUTH_STUB = `
create schema if not exists auth;

create table auth.users (
  id    uuid primary key,
  email text
);

-- Supabase ile birebir aynı davranış: JWT claim'lerinden 'sub' okunur.
create or replace function auth.uid() returns uuid
language sql stable as $$
  -- Supabase ile aynı sıra: boş değer cast'ten ÖNCE elenir, yoksa ''::json patlar.
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
           ''
         )::uuid;
$$;

-- Supabase'deki auth.role() ile aynı: isteğin JWT talebindeki rol.
create or replace function auth.role() returns text
language sql stable as $$
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
           ''
         )::text;
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
`;


export type TestDb = PGlite & {
  /** Belirtilen kullanıcı kimliğiyle (RLS devrede) sorgu çalıştırır. */
  as<T>(userId: string | null, fn: (db: PGlite) => Promise<T>): Promise<T>;
  /** RLS'i atlayarak yönetici/servis işlemi yapar (tohumlama, içe aktarım). */
  asService<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
  /** Giriş yapmamış ziyaretçi olarak çalışır (anon rolü, auth.uid() null). */
  asAnon<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
  /**
   * Tüm veriyi siler ama şemayı korur. Her test için migration'ları yeniden
   * çalıştırmak yerine bunu kullanmak test süresini onda birine indirir.
   */
  temizle(): Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create({ extensions: { btree_gist, pgcrypto } });

  await db.exec(AUTH_STUB);

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Migration başarısız: ${file}\n${(err as Error).message}`);
    }
  }


  const tdb = db as unknown as TestDb;

  tdb.as = async (userId, fn) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role authenticated`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : "",
      ]);
      const result = await fn(db);
      await db.exec("commit");
      return result;
    } catch (err) {
      await db.exec("rollback");
      throw err;
    } finally {
      await db.exec("reset role");
    }
  };

  tdb.temizle = async () => {
    const { rows } = await db.query<{ tablo: string }>(
      `select quote_ident(c.relname) as tablo
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    // schools'u truncate etmek cascade ile her şeyi götürür; auth.users ayrı şemada.
    await db.exec(
      `truncate table ${rows.map((r) => r.tablo).join(", ")} restart identity cascade;
       truncate table auth.users cascade;`,
    );
  };

  tdb.asAnon = async (fn) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role anon`);
      // Gerçek bir anon isteği gibi: rol talebi var, kullanıcı (sub) yok.
      await db.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ role: "anon" })],
      );
      const result = await fn(db);
      await db.exec("commit");
      return result;
    } catch (err) {
      await db.exec("rollback");
      throw err;
    } finally {
      await db.exec("reset role");
    }
  };

  tdb.asService = async (fn) => {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    return fn(db);
  };

  return tdb;
}

export async function listMigrations(): Promise<string[]> {
  return (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
}
