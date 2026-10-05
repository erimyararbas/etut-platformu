/**
 * Bildirim okuma katmanı.
 *
 * Bildirimleri veritabanı tetikleyicileri üretir (0009); uygulama yalnızca
 * okur ve "okundu" işaretler. Yazma yetkisi kasıtlı olarak yoktur — 0011 ile
 * `authenticated` rolü yalnızca `okundu_at` kolonunu güncelleyebilir.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Bildirim } from "./gorunum";

export type { Bildirim, Ton } from "./gorunum";
export { ton, TON_SINIFI, gecenSure, rozetMetni, hedefYol } from "./gorunum";

interface Satir {
  id: string;
  tip: string;
  baslik: string;
  govde: string;
  data: Record<string, unknown> | null;
  okundu_at: string | null;
  created_at: string;
}

function eslestir(r: Satir): Bildirim {
  return {
    id: r.id,
    tip: r.tip,
    baslik: r.baslik,
    govde: r.govde,
    data: r.data ?? {},
    okunduMu: r.okundu_at !== null,
    createdAt: r.created_at,
  };
}

/**
 * Okunmamış bildirim sayısı — her sayfada zil rozetinde görünür.
 *
 * `head: true` ile satırlar çekilmez, yalnızca sayı döner; bu sorgu her istekte
 * çalıştığı için gövdeyi taşımanın anlamı yok.
 */
export async function okunmamisSayisi(): Promise<number> {
  const supabase = await supabaseSunucu();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("okundu_at", null);

  // Zil, sayfanın geri kalanını düşürecek kadar önemli değil: hata hâlinde
  // rozet gösterilmez ama sayfa açılır.
  if (error) {
    console.error("Okunmamış bildirim sayısı alınamadı:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Bildirim listesi, yeniden eskiye. */
export async function bildirimler(limit = 50): Promise<Bildirim[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, tip, baslik, govde, data, okundu_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Bildirimler okunamadı: ${error.message}`);
  return (data ?? []).map((r) => eslestir(r as Satir));
}
