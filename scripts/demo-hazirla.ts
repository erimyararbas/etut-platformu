/**
 * Demo hesaplarını hazırlar.
 *
 *   npm run demo-hazirla                 # örnek okul
 *   npm run demo-hazirla -- --slug baska
 *
 * Yaptığı iki şey:
 *   1. `DEMO_ROLLER` listesindeki hesapların şifresini `DEMO_SIFRE` ortam
 *      değişkenindeki değere eşitler. Giriş ekranındaki demo düğmesi o şifreyi
 *      kullanıyor; eşit değilse düğme çalışmaz.
 *   2. Okulun `demo_modu` ayarını açar — düğme ancak o zaman görünür.
 *
 * ŞİFRE BURADA YAZMIYOR ve yazmamalı: değeri `.env.local` (yerel) ve Vercel
 * ortam değişkeni (üretim) taşıyor. Depoya giren bir şifre, depoyu görebilen
 * herkesin şifresidir.
 *
 * Bu betik YALNIZCA tanıtım okulunda çalıştırılmalı: listedeki hesapların
 * mevcut şifrelerini geçersiz kılar.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_ROLLER } from "../src/lib/demo/roller";
import { kimligiCoz } from "../src/lib/auth/kimlik";

const KOK = path.resolve(import.meta.dirname, "..");

async function envYukle(): Promise<Record<string, string>> {
  const ham = await fs.readFile(path.join(KOK, ".env.local"), "utf8").catch(() => {
    throw new Error(".env.local bulunamadı.");
  });
  const env: Record<string, string> = {};
  for (const satir of ham.split(/\r?\n/)) {
    const m = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function argAl(ad: string): string | undefined {
  const i = process.argv.indexOf(`--${ad}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const env = { ...process.env, ...(await envYukle()) } as Record<string, string>;
  const slug = argAl("slug") ?? "ornek-okul";

  for (const gerekli of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_SIFRE"]) {
    if (!env[gerekli]) {
      throw new Error(
        `${gerekli} tanımlı değil.` +
          (gerekli === "DEMO_SIFRE"
            ? "\n\n.env.local dosyasına bir satır ekleyin:\n  DEMO_SIFRE=<kendi seçtiğiniz şifre>\n" +
              "Aynı değeri Vercel > Project Settings > Environment Variables içine de ekleyin."
            : ""),
      );
    }
  }
  if (env.DEMO_SIFRE.length < 8) {
    throw new Error("DEMO_SIFRE en az 8 karakter olmalı (Supabase şartı).");
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: okul } = await supabase
    .from("schools")
    .select("id, ad")
    .eq("slug", slug)
    .maybeSingle();
  if (!okul) throw new Error(`"${slug}" okulu bulunamadı.`);

  console.log(`\nOkul: ${okul.ad} (/${slug})\n`);

  // Auth kullanıcılarını bir kez çekip e-postaya göre eşleştiriyoruz; rol
  // başına ayrı listeleme beş gidiş-dönüş demekti.
  const { data: authListesi, error: listeHatasi } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listeHatasi) throw listeHatasi;
  const authHaritasi = new Map(authListesi.users.map((u) => [u.email ?? "", u.id]));

  let tamam = 0;
  for (const rol of DEMO_ROLLER) {
    const kimlik = kimligiCoz(slug, rol.kimlik);
    if (!kimlik) {
      console.log(`  ✗ ${rol.etiket}: kimlik çözülemedi (${rol.kimlik})`);
      continue;
    }

    const authId = authHaritasi.get(kimlik.authEpostasi);
    if (!authId) {
      console.log(`  ✗ ${rol.etiket}: hesap yok (${rol.kimlik})`);
      continue;
    }

    const { data: satir } = await supabase
      .from("users")
      .select("id, ad, soyad, school_id, durum")
      .eq("id", authId)
      .maybeSingle();

    if (!satir || satir.school_id !== okul.id) {
      console.log(`  ✗ ${rol.etiket}: hesap bu okula ait değil (${rol.kimlik})`);
      continue;
    }
    if (satir.durum !== "aktif") {
      console.log(`  ✗ ${rol.etiket}: hesap pasif (${rol.kimlik})`);
      continue;
    }

    const { error } = await supabase.auth.admin.updateUserById(authId, {
      password: env.DEMO_SIFRE,
    });
    if (error) {
      console.log(`  ✗ ${rol.etiket}: şifre ayarlanamadı — ${error.message}`);
      continue;
    }

    // Davet kodu bekleyen bir hesap giriş yapamaz; demo için kapatıyoruz.
    await supabase
      .from("users")
      .update({ sifre_belirlendi_mi: true, setup_token_hash: null, setup_token_expires_at: null })
      .eq("id", authId);

    console.log(`  ✓ ${rol.etiket.padEnd(18)} ${satir.ad} ${satir.soyad} (${rol.kimlik})`);
    tamam++;
  }

  const { error: ayarHatasi } = await supabase
    .from("school_settings")
    .update({ demo_modu: true })
    .eq("school_id", okul.id);
  if (ayarHatasi) throw new Error(`demo_modu açılamadı: ${ayarHatasi.message}`);

  console.log(`\n${tamam}/${DEMO_ROLLER.length} hesap hazır, demo modu açık.`);
  console.log(`Giriş ekranı: /${slug}/giris\n`);
  console.log("Üretimde de çalışması için Vercel'e DEMO_SIFRE ortam değişkenini ekleyin.");
}

main().catch((hata) => {
  console.error("\n" + (hata as Error).message + "\n");
  process.exit(1);
});
