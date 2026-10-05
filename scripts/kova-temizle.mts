/**
 * Kullanılmayan Storage kovasını kaldırır.
 *
 * Supabase, storage tablolarından doğrudan DELETE'e izin vermiyor; bu yüzden
 * 0022 kovayı SQL'den silemiyor ve iş buraya kalıyor. Betik yalnızca BOŞ
 * kovayı siler — dolu bir kovayı silmek veri kaybı olurdu.
 *
 *   npm run kova-temizle -- soru-gorselleri
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const kova = process.argv[2];
if (!kova) {
  console.error("Kullanım: npm run kova-temizle -- <kova-adi>");
  process.exit(1);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: dosyalar, error: listeHatasi } = await db.storage.from(kova).list();
if (listeHatasi) {
  console.error(`"${kova}" okunamadı: ${listeHatasi.message}`);
  process.exit(1);
}

if (dosyalar && dosyalar.length > 0) {
  console.error(`"${kova}" içinde ${dosyalar.length} öğe var — silinmedi.`);
  process.exit(1);
}

const { error } = await db.storage.deleteBucket(kova);
if (error) {
  console.error(`"${kova}" silinemedi: ${error.message}`);
  process.exit(1);
}

console.log(`"${kova}" kovası kaldırıldı.`);
