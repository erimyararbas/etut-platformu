/**
 * Migration çalıştırıcısı.
 *
 *   npm run db:push        → uygulanmamış migration'ları uygular
 *   npm run db:status      → neyin uygulandığını listeler
 *
 * Supabase CLI yerine bunun kullanılmasının sebebi: CLI `supabase login`
 * (tarayıcı) ve `supabase link` (şifre sorar) adımlarını etkileşimli olarak
 * ister. Bu script yalnızca .env.local içindeki bağlantı bilgilerine bakar.
 *
 * Her migration TEK bir transaction içinde çalışır: yarıda hata alırsa hiçbir
 * parçası uygulanmaz, veritabanı yarım kalmaz.
 */

import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const ENV_FILE = path.join(process.cwd(), ".env.local");

async function envYukle(): Promise<Record<string, string>> {
  let ham: string;
  try {
    ham = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      ".env.local bulunamadı. .env.local.example dosyasını kopyalayıp Supabase " +
        "değerlerinizi doldurun.",
    );
  }
  const env: Record<string, string> = {};
  for (const satir of ham.split(/\r?\n/)) {
    const m = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/**
 * Bağlantı ayarları .env.local'den; `service.ts` ile aynı kurallar:
 * ayrı alanlar (host/user/password) tercih edilir, tek satırlık
 * SUPABASE_DB_URL yedek olarak kabul edilir.
 */
async function baglan(env: Record<string, string>): Promise<Client> {
  let ayar: Record<string, unknown>;

  if (env.SUPABASE_DB_PASSWORD) {
    if (!env.SUPABASE_DB_HOST || !env.SUPABASE_DB_USER) {
      throw new Error(".env.local içinde SUPABASE_DB_HOST ve SUPABASE_DB_USER gerekli.");
    }
    ayar = {
      host: env.SUPABASE_DB_HOST,
      user: env.SUPABASE_DB_USER,
      password: env.SUPABASE_DB_PASSWORD,
      port: Number(env.SUPABASE_DB_PORT ?? 5432),
      database: env.SUPABASE_DB_NAME ?? "postgres",
    };
  } else {
    const url = env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error(
        "Veritabanı bağlantısı tanımlı değil. .env.local içine SUPABASE_DB_PASSWORD ekleyin.",
      );
    }
    if (/:6543\//.test(url)) {
      throw new Error(
        "Transaction pooler (port 6543) migration için uygun değil — DDL komutlarını\n" +
          "güvenilir çalıştırmaz. Session pooler (port 5432) adresini kullanın.",
      );
    }
    if (/\[YOUR-PASSWORD\]/i.test(url)) {
      throw new Error("Bağlantı adresindeki [YOUR-PASSWORD] gerçek şifreyle değiştirilmemiş.");
    }
    ayar = { connectionString: url };
  }

  const client = new Client({
    ...ayar,
    // Supabase TLS zorunlu tutar; sertifika zinciri Supabase'in kendi CA'sından.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Supabase'in KENDİ migration kayıt tablosunu kullanıyoruz
 * (supabase_migrations.schema_migrations). Böylece bu script, Supabase CLI ve
 * MCP connector aynı kaydı görür; biri diğerinin uyguladığını tekrar uygulamaz.
 *
 * Kayıt anahtarı dosya adının başındaki numara değil, "name" sütunudur:
 *   0003_sistem.sql  →  name = "0003_sistem"
 */
async function kayitTablosu(client: Client) {
  await client.query(`create schema if not exists supabase_migrations`);
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name    text,
      statements text[]
    )
  `);
}

function migrationAdi(dosya: string): string {
  return dosya.replace(/\.sql$/, "");
}

/**
 * Supabase CLI biçimi: YYYYMMDDHHMMSS.
 *
 * Çözünürlük SANİYE olduğu için aynı saniyede uygulanan iki migration aynı
 * sürüm numarasını alır ve ikincisi `schema_migrations_pkey` çakışmasıyla
 * düşer — üstelik SQL'i sorunsuz çalıştıktan SONRA. Bu gerçekten başa geldi:
 * 0026 ve 0027 aynı saniyeye denk gelip 0027 geri alındı.
 *
 * Bu yüzden numara monoton ilerletiliyor: aynı saniye içinde kalınırsa bir
 * önceki değerin bir fazlası kullanılır.
 */
let sonSurum = 0;

function surumNo(): string {
  // 14 hane (YYYYMMDDHHMMSS) en fazla ~2e13; Number.MAX_SAFE_INTEGER'ın
  // (9e15) çok altında, tam sayı aritmetiği güvenli.
  const simdi = Number(new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14));
  sonSurum = simdi > sonSurum ? simdi : sonSurum + 1;
  return String(sonSurum);
}

async function main() {
  const komut = process.argv[2] ?? "push";
  const env = await envYukle();
  const client = await baglan(env);
  try {
    await kayitTablosu(client);

    const { rows: uygulanmis } = await client.query<{ name: string }>(
      `select name from supabase_migrations.schema_migrations where name is not null`,
    );
    const uygulanmisSet = new Set(uygulanmis.map((r) => r.name));

    const dosyalar = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    if (komut === "status") {
      for (const dosya of dosyalar) {
        console.log(
          uygulanmisSet.has(migrationAdi(dosya))
            ? `  uygulandı  ${dosya}`
            : `  bekliyor   ${dosya}`,
        );
      }
      return;
    }

    let sayac = 0;
    for (const dosya of dosyalar) {
      const ad = migrationAdi(dosya);
      if (uygulanmisSet.has(ad)) continue;

      const icerik = await fs.readFile(path.join(MIGRATIONS_DIR, dosya), "utf8");

      process.stdout.write(`  ${dosya} ... `);
      await client.query("begin");
      try {
        await client.query(icerik);
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, name, statements)
           values ($1, $2, $3)`,
          [surumNo(), ad, [icerik]],
        );
        await client.query("commit");
        console.log("tamam");
        sayac++;
      } catch (err) {
        await client.query("rollback");
        console.log("HATA");
        throw new Error(`${dosya} uygulanamadı:\n${(err as Error).message}`);
      }
    }

    console.log(sayac === 0 ? "\nHer şey güncel." : `\n${sayac} migration uygulandı.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n" + (err as Error).message);
  process.exit(1);
});
