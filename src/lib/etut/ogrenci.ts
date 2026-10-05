/**
 * Öğrenci ekranlarının okuma katmanı.
 *
 * Tek veri kaynağı `ogrenci_etut_listesi` fonksiyonudur (bkz. migration 0007):
 * doluluk, kendi durumu, rezervasyon penceresi ve çakışma tek sorguda gelir.
 * Rezervasyon penceresi kuralı burada TEKRAR YAZILMAZ — veritabanında ne
 * diyorsa o geçerlidir.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { OgrenciEtut, RezervasyonDurumu } from "./ogrenci-gorunum";

export type { RezervasyonDurumu, OgrenciEtut, EylemTuru, Eylem } from "./ogrenci-gorunum";
export { eylemBelirle } from "./ogrenci-gorunum";

export async function ogrencininEtutleri(ogrenciId: string): Promise<OgrenciEtut[]> {
  const supabase = await supabaseSunucu();

  const { data, error } = await supabase.rpc("ogrenci_etut_listesi", {
    p_student_id: ogrenciId,
  });
  if (error) throw new Error(`Etütler okunamadı: ${error.message}`);

  const satirlar = (data ?? []) as Record<string, unknown>[];

  // Öğretmen adı: dar görünümden, tek sorguda.
  const adlar = new Map<string, string>();
  const ogretmenIdleri = [...new Set(satirlar.map((s) => s.ogretmen_id as string))];
  if (ogretmenIdleri.length) {
    const { data: ogretmenler } = await supabase
      .from("v_ogretmen_dizini")
      .select("id, ad, soyad")
      .in("id", ogretmenIdleri);
    for (const o of ogretmenler ?? []) adlar.set(o.id, `${o.ad} ${o.soyad}`);
  }

  return satirlar.map((s) => ({
    id: s.id as string,
    tarih: s.tarih as string,
    baslangic: (s.baslangic as string).slice(0, 5),
    bitis: (s.bitis as string).slice(0, 5),
    kontenjan: Number(s.kontenjan),
    aciklama: (s.aciklama as string | null) ?? null,
    sinifEtuduMu: Boolean(s.sinif_etudu_mu),
    ders: s.ders as string,
    konu: (s.konu as string | null) ?? null,
    tur: s.tur as string,
    derslik: (s.derslik as string | null) ?? null,
    ogretmen: adlar.get(s.ogretmen_id as string) ?? "—",
    dolu: Number(s.dolu),
    bekleyen: Number(s.bekleyen),
    benimDurumum: (s.benim_durumum as RezervasyonDurumu) ?? null,
    benimSiram: s.benim_siram === null ? null : Number(s.benim_siram),
    iptalTalebim: (s.iptal_talebim as OgrenciEtut["iptalTalebim"]) ?? "yok",
    rezervasyonAcik: Boolean(s.rezervasyon_acik),
    cakisma: Boolean(s.cakisma),
  }));
}
