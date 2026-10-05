/**
 * Rehberlik okuma katmanı.
 *
 * Erişimi RLS belirliyor (0023) ve burada hiçbir rol kontrolü TEKRARLANMIYOR.
 * Yönetici bu fonksiyonları çağırsa boş liste alır — kural veritabanında,
 * uygulamada değil.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { GorusmeNotu, Randevu, RiskKaydi, Vaka } from "./gorunum";

export type * from "./gorunum";
export {
  ONCELIK_ADI,
  ONCELIK_SINIFI,
  RANDEVU_DURUM_ADI,
  RANDEVU_TUR_ADI,
  VAKA_DURUM_ADI,
  gorunurlukMetni,
  riskBandi,
} from "./gorunum";

/** Ad çözümlemesi: rehber `users` tablosunu doğrudan okuyamaz, dizinleri kullanır. */
async function dizinler(
  supabase: Awaited<ReturnType<typeof supabaseSunucu>>,
  ogrenciIdleri: Iterable<string>,
  personelIdleri: Iterable<string>,
) {
  const ogrenci = new Map<string, { ad: string; sinif: string | null }>();
  const personel = new Map<string, string>();

  const o = [...new Set(ogrenciIdleri)];
  const p = [...new Set(personelIdleri)];

  await Promise.all([
    (async () => {
      if (!o.length) return;
      const { data } = await supabase
        .from("v_ogrenci_dizini")
        .select("id, ad, soyad, sinif_kodu")
        .in("id", o);
      for (const x of data ?? []) {
        ogrenci.set(x.id, { ad: `${x.ad} ${x.soyad}`, sinif: x.sinif_kodu });
      }
    })(),
    (async () => {
      if (!p.length) return;
      const { data } = await supabase
        .from("v_ogretmen_dizini")
        .select("id, ad, soyad")
        .in("id", p);
      for (const x of data ?? []) personel.set(x.id, `${x.ad} ${x.soyad}`);
    })(),
  ]);

  return { ogrenci, personel };
}

export async function riskKuyrugu(gun = 30): Promise<RiskKaydi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("risk_kuyrugu", { p_gun: gun });

  if (error) throw new Error(`Risk kuyruğu okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ogrenciId: r.ogrenci_id as string,
    adSoyad: `${r.ad} ${r.soyad}`,
    sinif: (r.sinif_kodu as string | null) ?? null,
    mentor: (r.mentor_ad as string | null) ?? null,
    skor: Number(r.skor ?? 0),
    devamsizlik: Number(r.devamsizlik ?? 0),
    katilim: r.katilim === null ? null : Number(r.katilim),
    ortYildiz: r.ort_yildiz === null ? null : Number(r.ort_yildiz),
    acikVaka: Number(r.acik_vaka ?? 0),
    gerekceler: (r.gerekceler as string[] | null) ?? [],
  }));
}

interface HamVaka {
  id: string;
  student_id: string;
  baslik: string;
  oncelik: Vaka["oncelik"];
  durum: Vaka["durum"];
  acan: string;
  created_at: string;
  case_notes: { id: string }[];
}

export async function vakalar(): Promise<Vaka[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("counseling_cases")
    .select("id, student_id, baslik, oncelik, durum, acan, created_at, case_notes(id)")
    .order("durum")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Vakalar okunamadı: ${error.message}`);

  const ham = (data ?? []) as unknown as HamVaka[];
  const { ogrenci, personel } = await dizinler(
    supabase,
    ham.map((v) => v.student_id),
    ham.map((v) => v.acan),
  );

  return ham.map((v) => {
    const o = ogrenci.get(v.student_id);
    return {
      id: v.id,
      ogrenciId: v.student_id,
      ogrenci: o?.ad ?? null,
      sinif: o?.sinif ?? null,
      baslik: v.baslik,
      oncelik: v.oncelik,
      durum: v.durum,
      acan: personel.get(v.acan) ?? null,
      notSayisi: (v.case_notes ?? []).length,
      createdAt: v.created_at,
    };
  });
}

export async function vakaNotlari(vakaId: string): Promise<GorusmeNotu[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("case_notes")
    .select("id, yazan, metin, gorunurluk, yalnizca_yazan, created_at")
    .eq("case_id", vakaId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Notlar okunamadı: ${error.message}`);

  const ham = data ?? [];
  const { personel } = await dizinler(supabase, [], ham.map((n) => n.yazan));

  return ham.map((n) => ({
    id: n.id,
    yazan: personel.get(n.yazan) ?? null,
    metin: n.metin,
    gorunurluk: n.gorunurluk ?? [],
    yalnizcaYazan: n.yalnizca_yazan,
    createdAt: n.created_at,
  }));
}

interface HamRandevu {
  id: string;
  student_id: string;
  tur: Randevu["tur"];
  tarih: string | null;
  baslangic: string | null;
  durum: Randevu["durum"];
  talep_eden: string;
  talep_notu: string | null;
  ret_nedeni: string | null;
}

export async function randevular(ogrenciId?: string): Promise<Randevu[]> {
  const supabase = await supabaseSunucu();

  let sorgu = supabase
    .from("appointments")
    .select("id, student_id, tur, tarih, baslangic, durum, talep_eden, talep_notu, ret_nedeni")
    .order("tarih", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(200);

  if (ogrenciId) sorgu = sorgu.eq("student_id", ogrenciId);

  const { data, error } = await sorgu;
  if (error) throw new Error(`Randevular okunamadı: ${error.message}`);

  const ham = (data ?? []) as unknown as HamRandevu[];
  const { ogrenci } = await dizinler(supabase, ham.map((r) => r.student_id), []);

  return ham.map((r) => {
    const o = ogrenci.get(r.student_id);
    return {
      id: r.id,
      ogrenciId: r.student_id,
      ogrenci: o?.ad ?? null,
      sinif: o?.sinif ?? null,
      tur: r.tur,
      tarih: r.tarih,
      baslangic: r.baslangic ? r.baslangic.slice(0, 5) : null,
      durum: r.durum,
      // Talebi açanın adı rehbere gerekli değil; öğrenci adı zaten var.
      talepEden: null,
      talepNotu: r.talep_notu,
      retNedeni: r.ret_nedeni,
    };
  });
}
