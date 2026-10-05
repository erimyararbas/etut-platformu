/**
 * Rehberin form açılır listeleri: öğrenci ve ders dizini.
 *
 * `v_ogrenci_dizini` üzerinden okunuyor çünkü rehberin `users` ve `students`
 * tablolarında doğrudan okuma hakkı yok (0004). Bu görünüm tam bu iş için var
 * ve `is_staff()` şartını kendi içinde taşıyor — burada rol kontrolü
 * tekrarlanmıyor.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface DizinOgrencisi {
  id: string;
  adSoyad: string;
  okulNo: string;
  sinif: string | null;
}

export interface DizinDersi {
  id: string;
  ad: string;
}

export async function ogrenciDizini(): Promise<DizinOgrencisi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("v_ogrenci_dizini")
    .select("id, ad, soyad, okul_no, sinif_kodu")
    .order("sinif_kodu")
    .order("soyad");

  if (error) throw new Error(`Öğrenci dizini okunamadı: ${error.message}`);

  return (data ?? []).map((o) => ({
    id: o.id,
    adSoyad: `${o.ad} ${o.soyad}`,
    okulNo: o.okul_no,
    sinif: o.sinif_kodu,
  }));
}

export async function dersListesi(): Promise<DizinDersi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("subjects")
    .select("id, ad")
    .eq("aktif", true)
    .order("ad");

  if (error) throw new Error(`Ders listesi okunamadı: ${error.message}`);
  return (data ?? []).map((d) => ({ id: d.id, ad: d.ad }));
}

export interface DizinOgretmeni {
  id: string;
  adSoyad: string;
  /** Branş dersi; etüt açarken ders otomatik seçilsin diye. */
  bransId: string | null;
  brans: string | null;
}

/**
 * Öğretmen listesi — rehberin etüt açarken seçeceği kişi.
 *
 * `v_ogretmen_dizini` yalnızca ad/soyad veriyor; branş `teachers` tablosunda
 * ve o tablo okul üyelerine açık (0004). İkisi ayrı sorgudan birleşiyor.
 */
export async function ogretmenDizini(): Promise<DizinOgretmeni[]> {
  const supabase = await supabaseSunucu();
  const [{ data: kisiler, error }, { data: branslar }] = await Promise.all([
    supabase.from("v_ogretmen_dizini").select("id, ad, soyad").order("soyad"),
    supabase.from("teachers").select("user_id, brans_subject_id, subjects(ad)"),
  ]);

  if (error) throw new Error(`Öğretmen dizini okunamadı: ${error.message}`);

  const bransHaritasi = new Map(
    (branslar ?? []).map((b) => {
      const d = b.subjects as { ad: string } | { ad: string }[] | null;
      const ad = Array.isArray(d) ? (d[0]?.ad ?? null) : (d?.ad ?? null);
      return [b.user_id, { id: b.brans_subject_id as string | null, ad }];
    }),
  );

  return (kisiler ?? []).map((k) => {
    const b = bransHaritasi.get(k.id);
    return {
      id: k.id,
      adSoyad: `${k.ad} ${k.soyad}`,
      bransId: b?.id ?? null,
      brans: b?.ad ?? null,
    };
  });
}
