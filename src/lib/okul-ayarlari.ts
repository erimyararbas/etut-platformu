/**
 * Okulun herkese açık ayarları.
 *
 * `school_settings` satırını okulun HER üyesi okuyabilir (school_settings_uye_okur,
 * 0004) — yalnızca yönetici yazabilir. Bu yüzden geri sayım için ayrı bir
 * yetki kontrolü gerekmiyor; RLS zaten kullanıcıyı kendi okuluyla sınırlıyor.
 */

import "server-only";
import { cache } from "react";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface SinavBilgisi {
  ad: string;
  tarih: string;
}

/**
 * Geri sayım için sınav adı ve tarihi. İkisinden biri boşsa geri sayım
 * gösterilmez — yarım bilgiyle "? gün kaldı" yazmanın anlamı yok.
 */
export const sinavBilgisi = cache(async (): Promise<SinavBilgisi | null> => {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("school_settings")
    .select("sinav_adi, sinav_tarihi")
    .maybeSingle();

  // Geri sayım süs; okunamazsa sayfanın geri kalanı yine de açılmalı.
  if (error || !data?.sinav_adi || !data?.sinav_tarihi) return null;

  return { ad: data.sinav_adi, tarih: data.sinav_tarihi };
});
