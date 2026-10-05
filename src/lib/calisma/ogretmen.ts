/**
 * Öğretmenin öğrenci çalışma takibi.
 *
 * Toplamlar `ogretmen_calisma_ozeti` fonksiyonundan tek sorguda geliyor (0018);
 * öğrenci başına sorgu atmak bir sınıf için otuz gidiş-dönüş demekti.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { OgrenciCalismasi } from "./ogretmen-gorunum";

export type { OgrenciCalismasi, SiralamaOlcutu } from "./ogretmen-gorunum";
export { SIRALAMALAR, sirala, sonCalismaMetni } from "./ogretmen-gorunum";

export async function ogrencilerinCalismasi(
  baslangic: string,
  bitis: string,
): Promise<OgrenciCalismasi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogretmen_calisma_ozeti", {
    p_baslangic: baslangic,
    p_bitis: bitis,
  });

  if (error) throw new Error(`Çalışma özeti okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ogrenciId: r.ogrenci_id as string,
    adSoyad: `${r.ad} ${r.soyad}`,
    okulNo: r.okul_no as string,
    sinif: (r.sinif_kodu as string | null) ?? null,
    soru: Number(r.soru ?? 0),
    net: Number(r.net ?? 0),
    sureSaniye: Number(r.sure_saniye ?? 0),
    sonCalisma: (r.son_calisma as string | null) ?? null,
    aktifHedef: Number(r.aktif_hedef ?? 0),
  }));
}
