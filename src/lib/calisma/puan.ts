/**
 * Öğrencinin puan özeti.
 *
 * Toplam `point_ledger` hareketlerinden gelir (0019): tek bir "toplam" kolonu
 * tutulmadığı için "bu yıldız nereden geldi" sorusunun cevabı her zaman kayıtta.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface PuanOzeti {
  yildiz: number;
  elmas: number;
  degerlendirmeSayisi: number;
  /** Bir ondalıklı ortalama; hiç değerlendirme yoksa null. */
  ortalama: number | null;
}

export async function puanOzeti(ogrenciId: string): Promise<PuanOzeti> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_puan_ozeti", {
    p_student_id: ogrenciId,
  });

  // Puan süs bilgisi; okunamazsa sayfanın geri kalanı yine açılmalı.
  if (error) {
    console.error("Puan özeti okunamadı:", error.message);
    return { yildiz: 0, elmas: 0, degerlendirmeSayisi: 0, ortalama: null };
  }

  const r = (data as Record<string, unknown>[] | null)?.[0];
  return {
    yildiz: Number(r?.toplam_yildiz ?? 0),
    elmas: Number(r?.toplam_elmas ?? 0),
    degerlendirmeSayisi: Number(r?.degerlendirme ?? 0),
    ortalama: r?.ortalama_yildiz == null ? null : Number(r.ortalama_yildiz),
  };
}
