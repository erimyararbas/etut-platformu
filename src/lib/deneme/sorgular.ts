/**
 * Deneme sınavlarının okuma katmanı.
 *
 * Erişimi RLS belirliyor (0027) ve burada hiçbir rol kontrolü TEKRARLANMIYOR:
 * öğrenci kendi sonucunu, veli çocuğununkini, personel okulunkini görür.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Deneme, DenemeOgrenciSatiri, DenemeSonucu, GecmisSatiri } from "./gorunum";
import { denemeleriGrupla } from "./gorunum";

export type * from "./gorunum";
export {
  denemeleriGrupla,
  netGelisimi,
  ortalamaNet,
  sonDegisim,
  tarihKisa,
} from "./gorunum";

/** Okulun deneme listesi, yeniden eskiye. */
export async function denemeler(): Promise<Deneme[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("mock_exams")
    .select("id, ad, tarih, tur, mock_exam_results(count)")
    .order("tarih", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Denemeler okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    ad: r.ad as string,
    tarih: r.tarih as string,
    tur: (r.tur as string | null) ?? null,
    // PostgREST'in count toplaması dizi içinde tek nesne olarak gelir.
    ogrenciSayisi:
      (r.mock_exam_results as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

/** Bir öğrencinin bütün deneme geçmişi, sınav başına toplanmış. */
export async function ogrencininDenemeleri(ogrenciId: string): Promise<DenemeSonucu[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_deneme_gecmisi", {
    p_student_id: ogrenciId,
  });

  if (error) throw new Error(`Deneme geçmişi okunamadı: ${error.message}`);

  const satirlar: GecmisSatiri[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    examId: r.exam_id as string,
    ad: r.ad as string,
    tarih: r.tarih as string,
    tur: (r.tur as string | null) ?? null,
    puan: r.puan === null ? null : Number(r.puan),
    siralama: r.siralama === null ? null : Number(r.siralama),
    subjectId: r.subject_id as string,
    ders: r.ders as string,
    dogru: Number(r.dogru ?? 0),
    yanlis: Number(r.yanlis ?? 0),
    bos: Number(r.bos ?? 0),
    net: Number(r.net ?? 0),
  }));

  return denemeleriGrupla(satirlar);
}

/** Bir denemenin öğrenci bazında sonuçları — rehberin sınav ekranı. */
export async function denemeSonuclari(examId: string): Promise<DenemeOgrenciSatiri[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("deneme_sonuclari", { p_exam_id: examId });

  if (error) throw new Error(`Sonuçlar okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ogrenciId: r.student_id as string,
    adSoyad: `${r.ad} ${r.soyad}`,
    okulNo: r.okul_no as string,
    sinif: (r.sinif_kodu as string | null) ?? null,
    puan: r.puan === null ? null : Number(r.puan),
    siralama: r.siralama === null ? null : Number(r.siralama),
    toplamNet: Number(r.toplam_net ?? 0),
    dersSayisi: Number(r.ders_sayisi ?? 0),
  }));
}
