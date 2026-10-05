/**
 * Veli panelinin okuma katmanı.
 *
 * Veli kendi çocuğundan başkasını göremez; bu kısıt uygulamada değil,
 * veritabanında (`v_velinin_ogrencileri` görünümü ve `ogrenci_etut_gecmisi`
 * fonksiyonunun içindeki yetki kontrolü).
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Ogrenci, EtutGecmisi } from "./gorunum";

export type { Ogrenci, EtutGecmisi, Ozet } from "./gorunum";
export { ozetHesapla } from "./gorunum";

/** Velinin bağlı olduğu öğrenciler. Birden çok çocuk olabilir. */
export async function velininOgrencileri(): Promise<Ogrenci[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("v_velinin_ogrencileri")
    .select("ogrenci_id, ad, soyad, okul_no, sinif_kodu, yakinlik")
    .order("ad");

  if (error) throw new Error(`Öğrenci listesi okunamadı: ${error.message}`);

  return (data ?? []).map((o) => ({
    id: o.ogrenci_id,
    ad: o.ad,
    soyad: o.soyad,
    okulNo: o.okul_no,
    sinif: o.sinif_kodu,
    yakinlik: o.yakinlik,
  }));
}

/**
 * Öğrencinin etüt geçmişi. Veli, öğrencinin kendisi ve okul personeli
 * çağırabilir — kimin neyi görebileceğine veritabanı karar verir.
 */
export async function etutGecmisi(ogrenciId: string): Promise<EtutGecmisi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("ogrenci_etut_gecmisi", {
    p_student_id: ogrenciId,
  });

  if (error) throw new Error(`Etüt geçmişi okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    etutId: r.etut_id as string,
    tarih: r.tarih as string,
    baslangic: (r.baslangic as string).slice(0, 5),
    bitis: (r.bitis as string).slice(0, 5),
    ders: r.ders as string,
    konu: (r.konu as string | null) ?? null,
    tur: r.tur as string,
    derslik: (r.derslik as string | null) ?? null,
    ogretmen: r.ogretmen_ad as string,
    kayitDurumu: r.kayit_durumu as EtutGecmisi["kayitDurumu"],
    yoklama: (r.yoklama as EtutGecmisi["yoklama"]) ?? null,
    yildiz: r.yildiz === null ? null : Number(r.yildiz),
    hazirYorumlar: (r.hazir_yorumlar as string[] | null) ?? [],
    yorum: (r.yorum as string | null) ?? null,
  }));
}
