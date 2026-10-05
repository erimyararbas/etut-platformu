/**
 * Yeni bir okul (kiracı) ve ilk yöneticisini oluşturur.
 *
 *   npm run okul-olustur -- --slug bahcesehir --ad "Bahçeşehir Koleji" \
 *                           --yonetici-eposta mudur@okul.k12.tr \
 *                           --yonetici-ad "Ayşe" --yonetici-soyad "Yönetici"
 *
 * Bu, SaaS tarafındaki tek manuel adımdır: okulun geri kalan verisi Excel
 * şablonlarıyla gelir. Çıktıda yöneticinin tek kullanımlık davet kodu vardır;
 * yönetici ilk girişte bu kodla kendi şifresini belirler.
 *
 * Script yeniden çalıştırılabilir: okul veya yönetici zaten varsa yeniden
 * oluşturmaz, yalnızca yöneticiye yeni bir davet kodu üretir.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import { davetKoduUret, davetKoduOzeti, davetSonKullanma } from "../src/lib/import/davet";

interface Argumanlar {
  slug: string;
  ad: string;
  yoneticiEposta: string;
  yoneticiAd: string;
  yoneticiSoyad: string;
  yoneticiTelefon?: string;
}

function argumanlariOku(): Argumanlar {
  const argv = process.argv.slice(2);
  const al = (ad: string): string | undefined => {
    const i = argv.indexOf(`--${ad}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const slug = al("slug");
  const ad = al("ad");
  const yoneticiEposta = al("yonetici-eposta");

  if (!slug || !ad || !yoneticiEposta) {
    throw new Error(
      "Kullanım:\n" +
        '  npm run okul-olustur -- --slug bahcesehir --ad "Bahçeşehir Koleji" \\\n' +
        '       --yonetici-eposta mudur@okul.k12.tr --yonetici-ad "Ayşe" --yonetici-soyad "Yönetici"',
    );
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `Slug yalnızca küçük harf, rakam ve tire içerebilir (girilen: "${slug}").\n` +
        "Bu değer adres satırında görünür: oalbal.com/bahcesehir/...",
    );
  }

  return {
    slug,
    ad,
    yoneticiEposta: yoneticiEposta.toLowerCase(),
    yoneticiAd: al("yonetici-ad") ?? "Okul",
    yoneticiSoyad: al("yonetici-soyad") ?? "Yöneticisi",
    yoneticiTelefon: al("yonetici-telefon"),
  };
}

async function envYukle(): Promise<Record<string, string>> {
  const ham = await fs
    .readFile(path.join(process.cwd(), ".env.local"), "utf8")
    .catch(() => {
      throw new Error(".env.local bulunamadı.");
    });
  const env: Record<string, string> = {};
  for (const satir of ham.split(/\r?\n/)) {
    const m = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const args = argumanlariOku();
  const env = await envYukle();

  for (const gerekli of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[gerekli]) throw new Error(`.env.local içinde ${gerekli} boş.`);
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Doğrudan veritabanı bağlantısı yerine servis anahtarıyla PostgREST:
  // burada transaction gerekmiyor ve script'in tek bağımlılığı kalıyor.
  const { data: mevcutOkul } = await supabase
    .from("schools")
    .select("id")
    .eq("slug", args.slug)
    .maybeSingle();

  let schoolId: string;
  if (mevcutOkul) {
    schoolId = mevcutOkul.id;
    await supabase.from("schools").update({ ad: args.ad }).eq("id", schoolId);
    console.log(`Okul zaten vardı: ${args.ad} (/${args.slug})`);
  } else {
    const { data, error } = await supabase
      .from("schools")
      .insert({ slug: args.slug, ad: args.ad })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Okul oluşturulamadı: ${error?.message}`);
    schoolId = data.id;
    console.log(`Okul oluşturuldu: ${args.ad} (/${args.slug})`);
  }

  await supabase.from("school_settings").upsert({ school_id: schoolId }, { onConflict: "school_id" });

  // --- Auth kullanıcısı ---
  // Auth yönetim API'si e-postaya göre arama sunmadığı için önce kendi
  // tablomuza bakıyoruz; yönetici e-postası users.eposta'da duruyor.
  const { data: mevcutKullanici } = await supabase
    .from("users")
    .select("id")
    .eq("school_id", schoolId)
    .eq("eposta", args.yoneticiEposta)
    .maybeSingle();

  let authId: string;
  if (mevcutKullanici) {
    authId = mevcutKullanici.id;
    console.log("Yönetici zaten vardı, yeni davet kodu üretiliyor.");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: args.yoneticiEposta,
      // Kullanıcı bu şifreyi hiç görmez; davet koduyla kendisi belirler.
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Yönetici oluşturulamadı: ${error?.message}`);
    }
    authId = data.user.id;
    console.log("Yönetici auth kaydı oluşturuldu.");
  }

  // --- Uygulama kullanıcısı ve rolü ---
  const kod = davetKoduUret();
  const { error: kullaniciHatasi } = await supabase.from("users").upsert(
    {
      id: authId,
      school_id: schoolId,
      ad: args.yoneticiAd,
      soyad: args.yoneticiSoyad,
      eposta: args.yoneticiEposta,
      telefon: args.yoneticiTelefon ?? null,
      setup_token_hash: davetKoduOzeti(kod),
      setup_token_expires_at: davetSonKullanma().toISOString(),
      sifre_belirlendi_mi: false,
    },
    { onConflict: "id" },
  );
  if (kullaniciHatasi) throw new Error(`Yönetici kaydedilemedi: ${kullaniciHatasi.message}`);

  await supabase
    .from("user_roles")
    .upsert({ user_id: authId, school_id: schoolId, role: "admin" }, { onConflict: "user_id,role" });

  console.log("\n" + "=".repeat(58));
  console.log("  Yönetici giriş bilgileri");
  console.log("=".repeat(58));
  console.log(`  Adres       : /${args.slug}/giris`);
  console.log(`  Kimlik      : ${args.yoneticiEposta}`);
  console.log(`  Davet kodu  : ${kod}`);
  console.log("=".repeat(58));
  console.log("  İlk girişte bu kodla kendi şifrenizi belirleyeceksiniz.");
  console.log(`  Kod ${davetSonKullanma().toLocaleDateString("tr-TR")} tarihine kadar geçerlidir.\n`);
}

main().catch((err) => {
  console.error("\n" + (err as Error).message);
  process.exit(1);
});
