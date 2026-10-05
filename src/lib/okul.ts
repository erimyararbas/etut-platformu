/**
 * Kiracı (okul) çözümlemesi.
 *
 * Adres yapısı: /{okulSlug}/... — slug'tan okulun kimliğini ve marka bilgisini
 * bulur. Bu sorgu `v_okullar_acik` görünümünden yapılır; giriş yapmamış
 * ziyaretçinin de erişebildiği tek okul verisi budur (ad, logo, tema).
 */

import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface Okul {
  id: string;
  slug: string;
  ad: string;
  logoUrl: string | null;
  tema: Record<string, unknown>;
  /** Giriş ekranında "demo olarak incele" görünsün mü? (0031/0032) */
  demoModu: boolean;
}

/** Slug'tan okul; yoksa null. Aynı istek içinde tek sorgu. */
export const okulBul = cache(async (slug: string): Promise<Okul | null> => {
  const supabase = await supabaseSunucu();
  const { data } = await supabase
    .from("v_okullar_acik")
    .select("id, slug, ad, logo_url, tema, demo_modu")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    ad: data.ad,
    logoUrl: data.logo_url,
    tema: (data.tema ?? {}) as Record<string, unknown>,
    demoModu: data.demo_modu === true,
  };
});

/** Okul yoksa 404. */
export async function okulZorunlu(slug: string): Promise<Okul> {
  const okul = await okulBul(slug);
  if (!okul) notFound();
  return okul;
}
