/**
 * Demo modu (0031).
 *
 * Demo, ürünü tanıtmak için kimlik doğrulamayı GEVŞETEN tek yer: ziyaretçi
 * şifreyi bilmeden bir role giriyor. Bu yüzden korunacak şey, gevşemenin
 * NEREDE DURDUĞU:
 *
 *   - Varsayılan KAPALI. Yeni kurulan gerçek bir okul, kimse bir şey
 *     yapmasa bile demoya açık doğmamalı. Bu testin düşmesi, bir okulun
 *     giriş ekranında istemeden demo düğmesi çıkması demektir.
 *   - Ayar okul BAZINDA. Örnek okulu açmak, aynı dağıtımdaki gerçek okulu
 *     açmamalı.
 *   - Yalnızca yönetici kapatıp açabilmeli.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, type TestDb } from "./db";
import { seedSchool, type SeededSchool } from "./seed";

let db: TestDb;
let s: SeededSchool;
let okulB: SeededSchool;

const cagir = <T = Record<string, unknown>>(
  kullanici: string | null,
  sql: string,
  params: unknown[] = [],
) => db.as(kullanici, (q: PGlite) => q.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  s = await seedSchool(db);
  okulB = await seedSchool(db, "ikinci-okul");
}, 120000);

afterAll(async () => db?.close());

const acikMi = async (kullanici: string | null, slug: string) => {
  const { rows } = await cagir<{ demo_modu: boolean }>(
    kullanici,
    `select demo_modu from v_okullar_acik where slug = $1`,
    [slug],
  );
  return rows[0]?.demo_modu ?? false;
};

describe("demo modu varsayılanı", () => {
  it("yeni okulda KAPALI", async () => {
    // Bu testin düşmesi, gerçek bir okulun giriş ekranında istemeden demo
    // düğmesi belirmesi demektir.
    expect(await acikMi(s.adminId, "ornek-okul")).toBe(false);
    expect(await acikMi(s.adminId, "ikinci-okul")).toBe(false);
  });

  it("olmayan okul için de kapalı sayılır", async () => {
    expect(await acikMi(s.adminId, "yok-boyle-okul")).toBe(false);
  });
});

describe("demo modu okul bazında", () => {
  beforeAll(async () => {
    await db.asService((q: PGlite) =>
      q.query(`update school_settings set demo_modu = true where school_id = $1`, [s.schoolId]),
    );
  });

  it("açılan okulda açık görünür", async () => {
    expect(await acikMi(s.adminId, "ornek-okul")).toBe(true);
  });

  it("DİĞER OKUL etkilenmez", async () => {
    // Örnek okulu demoya açmak, aynı kurulumdaki gerçek okulu açmamalı.
    expect(await acikMi(okulB.adminId, "ikinci-okul")).toBe(false);
  });

  it("oturum açmamış ziyaretçi de sorabilir", async () => {
    // Giriş ekranı bu soruyu oturumsuz soruyor; anon çağıramazsa demo
    // düğmesi hiç görünmez.
    expect(await acikMi(null, "ornek-okul")).toBe(true);
  });

  it("anon ayar TABLOSUNU okuyamaz — yalnızca görünümdeki bu tek sütunu", async () => {
    // Görünüm yalnızca demo bayrağını taşıyor; ayar tablosunun tamamı kapalı.
    await expect(
      db.asAnon((q: PGlite) => q.query(`select * from school_settings`)),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });
});

describe("demo modunu kim değiştirebilir", () => {
  const degistir = (kullanici: string, okul: string, deger: boolean) =>
    cagir<{ n: number }>(
      kullanici,
      `with g as (update school_settings set demo_modu = $2 where school_id = $1 returning 1)
       select count(*)::int as n from g`,
      [okul, deger],
    );

  it("yönetici kendi okulunda kapatabilir", async () => {
    const { rows } = await degistir(s.adminId, s.schoolId, false);
    expect(rows[0].n).toBe(1);
    expect(await acikMi(s.adminId, "ornek-okul")).toBe(false);
  });

  it("ÖĞRETMEN ve REHBER değiştiremez", async () => {
    for (const kullanici of [s.teacherId, s.rehberId]) {
      const { rows } = await degistir(kullanici, s.schoolId, true);
      expect(rows[0].n).toBe(0);
    }
  });

  it("ÖĞRENCİ değiştiremez", async () => {
    const { rows } = await degistir(s.students[0], s.schoolId, true);
    expect(rows[0].n).toBe(0);
  });

  it("BAŞKA OKULUN yöneticisi değiştiremez", async () => {
    const { rows } = await degistir(okulB.adminId, s.schoolId, true);
    expect(rows[0].n).toBe(0);
  });
});
