/**
 * Sunucu tarafı servis erişimi.
 *
 * Buradaki iki istemci de RLS'i ATLAR ve yalnızca sunucuda kullanılır:
 *   - `servisIstemcisi()`  → Supabase Auth yönetimi (kullanıcı oluşturma, şifre)
 *   - `servisBaglantisi()` → doğrudan Postgres (içe aktarımın transaction'ı)
 *
 * PostgREST çok ifadeli transaction desteklemediği için içe aktarım doğrudan
 * veritabanı bağlantısı kullanır; "ya hep ya hiç" garantisi ancak böyle verilir.
 *
 * DİKKAT: bu modül asla bir istemci bileşeninden import edilmemelidir.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import type { DbClient } from "@/lib/import/apply";

/**
 * Ortam değişkeni okuma — DEĞERİ KIRPARAK.
 *
 * `trim()` süs değil: bu anahtarlar panoya kopyalanıp Vercel'in kutusuna
 * yapıştırılıyor ve sonuna kaçan tek bir satır sonu, HTTP başlığını geçersiz
 * kılıp `Authorization` başlığının hiç gönderilmemesine yol açıyor. Ortaya
 * çıkan hata "401 no_authorization" — yani "anahtar yanlış" değil, "anahtar
 * yok". Üretimde tam olarak bu oldu: anahtar doğru service_role anahtarıydı
 * ama 220 karakterdi, 219 değil; ilk giriş ve şifre sıfırlama çalışmıyordu.
 */
function zorunlu(ad: string): string {
  const deger = process.env[ad]?.trim();
  if (!deger) {
    throw new Error(
      `${ad} tanımlı değil. .env.local dosyasını .env.local.example örneğine göre doldurun.`,
    );
  }
  // Baştaki/sondaki boşluk kırpıldı; ortada kalan boşluk anahtarın kendisinin
  // bozuk olduğunu gösterir ve sessizce geçilmemeli.
  if (/\s/.test(deger)) {
    throw new Error(
      `${ad} içinde boşluk karakteri var. Anahtar kopyalanırken satır bölünmüş ` +
        `olabilir; tek satır hâlinde yeniden yapıştırın.`,
    );
  }
  return deger;
}

/** Supabase Auth yönetim istemcisi (service_role anahtarıyla). */
export function servisIstemcisi(): SupabaseClient {
  return createClient(
    zorunlu("NEXT_PUBLIC_SUPABASE_URL"),
    zorunlu("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Doğrudan Postgres bağlantısı. Çağıran `kapat()` çağırmakla yükümlüdür.
 *
 * Bağlantı `service_role` olarak değil, bağlantı adresindeki kullanıcıyla
 * (genelde `postgres`) açılır — `servis_baglantisi_mi()` bunu da servis
 * olarak tanır, çünkü istek bağlamı (JWT talebi) yoktur.
 */
/**
 * Bağlantı ayarları iki biçimde verilebilir:
 *
 *   1. SUPABASE_DB_HOST + SUPABASE_DB_USER + SUPABASE_DB_PASSWORD  (önerilen)
 *   2. SUPABASE_DB_URL — tek satırlık bağlantı adresi
 *
 * Birincisi tercih edilir çünkü şifrede `@ : / # ?` gibi karakterler varsa
 * bağlantı adresinin içinde bozulur; ayrı alanda böyle bir sorun yok.
 */
function baglantiAyarlari() {
  // Kırpılıyor ama boşluk denetimi YOK: bir şifrenin içinde boşluk olabilir.
  const sifre = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (sifre) {
    return {
      host: zorunlu("SUPABASE_DB_HOST"),
      user: zorunlu("SUPABASE_DB_USER"),
      password: sifre,
      port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
      database: process.env.SUPABASE_DB_NAME ?? "postgres",
    };
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "Veritabanı bağlantısı tanımlı değil. .env.local içine SUPABASE_DB_PASSWORD " +
        "(veya SUPABASE_DB_URL) ekleyin.",
    );
  }

  // Sık yapılan hata: buraya proje adresinin (https://...supabase.co)
  // yapıştırılması. pg'nin vereceği hata anlaşılmaz olurdu.
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      "SUPABASE_DB_URL bir Postgres bağlantı adresi olmalı (postgresql://... ile " +
        "başlar), proje adresi değil.",
    );
  }
  if (/:6543\//.test(url)) {
    throw new Error(
      "SUPABASE_DB_URL transaction pooler'ı (port 6543) gösteriyor. " +
        "İçe aktarım transaction kullanır; Session pooler (port 5432) gerekir.",
    );
  }
  if (/\[YOUR-PASSWORD\]/i.test(url)) {
    throw new Error(
      "SUPABASE_DB_URL içindeki [YOUR-PASSWORD] yer tutucusu gerçek veritabanı " +
        "şifresiyle değiştirilmemiş.",
    );
  }
  return { connectionString: url };
}

export async function servisBaglantisi(): Promise<{ db: DbClient; kapat: () => Promise<void> }> {
  const client = new PgClient({
    ...baglantiAyarlari(),
    // Supabase TLS zorunlu tutar; sertifika zinciri Supabase'in kendi CA'sından.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return {
    db: client as unknown as DbClient,
    kapat: () => client.end(),
  };
}
