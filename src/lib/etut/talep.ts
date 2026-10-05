/**
 * Etüt talebi — okuma katmanı.
 *
 * Kuyruğu kimin göreceğine RLS karar veriyor (0030): öğrenci ve velisi kendi
 * taleplerini, rehber ve yönetici okulun tamamını.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { EtutTalebi } from "./talep-gorunum";

export type * from "./talep-gorunum";
export { TALEP_DURUM_ADI, TALEP_DURUM_SINIFI } from "./talep-gorunum";

const SECIM = `
  id, student_id, neden, durum, karar_notu, etut_id, created_at,
  subjects(ad), topics(ad)
`;

function tekAd(x: { ad: string } | { ad: string }[] | null): string | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0]?.ad ?? null) : x.ad;
}

async function cevir(
  supabase: Awaited<ReturnType<typeof supabaseSunucu>>,
  ham: Record<string, unknown>[],
  adlariCoz: boolean,
): Promise<EtutTalebi[]> {
  const adlar = new Map<string, { ad: string; sinif: string | null }>();

  if (adlariCoz && ham.length) {
    // Öğrenci adları yalnızca personele gerekli; öğrenci kendi talebine
    // bakarken kendi adını zaten biliyor ve dizine erişimi de yok.
    const { data } = await supabase
      .from("v_ogrenci_dizini")
      .select("id, ad, soyad, sinif_kodu")
      .in("id", [...new Set(ham.map((t) => t.student_id as string))]);
    for (const o of data ?? []) {
      adlar.set(o.id, { ad: `${o.ad} ${o.soyad}`, sinif: o.sinif_kodu });
    }
  }

  return ham.map((t) => {
    const o = adlar.get(t.student_id as string);
    return {
      id: t.id as string,
      ogrenciId: t.student_id as string,
      ogrenci: o?.ad ?? null,
      sinif: o?.sinif ?? null,
      ders: tekAd(t.subjects as never),
      konu: tekAd(t.topics as never),
      neden: t.neden as string,
      durum: t.durum as EtutTalebi["durum"],
      kararNotu: (t.karar_notu as string | null) ?? null,
      etutId: (t.etut_id as string | null) ?? null,
      createdAt: t.created_at as string,
    };
  });
}

/** Rehberin kuyruğu: bekleyenler önce. */
export async function talepler(): Promise<EtutTalebi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etut_requests")
    .select(SECIM)
    .order("durum")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Talepler okunamadı: ${error.message}`);
  return cevir(supabase, (data ?? []) as unknown as Record<string, unknown>[], true);
}

/** Öğrencinin kendi talepleri. */
export async function ogrencininTalepleri(ogrenciId: string): Promise<EtutTalebi[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etut_requests")
    .select(SECIM)
    .eq("student_id", ogrenciId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Talepler okunamadı: ${error.message}`);
  return cevir(supabase, (data ?? []) as unknown as Record<string, unknown>[], false);
}
