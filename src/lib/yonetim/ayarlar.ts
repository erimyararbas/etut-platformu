/**
 * Okul ayarları — okuma katmanı.
 *
 * Bu ayarların çoğu VERİTABANI FONKSİYONLARI tarafından okunur (rezervasyon
 * penceresi, yoklama kilidi, bildirim kanalları). Yani buradan değiştirilen
 * değer, uygulama kodu değişmeden iş kurallarını değiştirir — ekranın işi
 * yalnızca doğru aralıkta bir değer yazmak.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Ayarlar } from "./ayar-gorunum";

export type { Ayarlar } from "./ayar-gorunum";
export { GUNLER, KANALLAR, ayarSemasi } from "./ayar-gorunum";

export async function ayarlariOku(): Promise<Ayarlar> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("school_settings")
    .select(
      `etut_onay_gerekli, rehber_etut_ogretmen_onayi, demo_modu,
       gelecek_hafta_acilis_gun, gelecek_hafta_acilis_saat,
       yoklama_kilit_saat, sinav_adi, sinav_tarihi, aktif_bildirim_kanallari`,
    )
    .single();

  if (error) throw new Error(`Ayarlar okunamadı: ${error.message}`);

  return {
    etutOnayGerekli: data.etut_onay_gerekli,
    rehberEtutOgretmenOnayi: data.rehber_etut_ogretmen_onayi,
    demoModu: data.demo_modu,
    acilisGun: data.gelecek_hafta_acilis_gun,
    // Postgres 'time' değeri "20:00:00" gelir; input[type=time] "20:00" ister.
    acilisSaat: (data.gelecek_hafta_acilis_saat as string).slice(0, 5),
    yoklamaKilitSaat: data.yoklama_kilit_saat,
    sinavAdi: data.sinav_adi ?? "",
    sinavTarihi: data.sinav_tarihi ?? "",
    kanallar: (data.aktif_bildirim_kanallari ?? ["inapp"]) as Ayarlar["kanallar"],
  };
}
