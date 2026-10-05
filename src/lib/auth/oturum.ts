/**
 * Oturum ve yetki yardımcıları.
 *
 * Server Action'lar doğrudan POST isteğiyle de çağrılabilir — arayüzden
 * geçmek zorunda değildir. Bu yüzden HER action kendi yetkisini burada
 * doğrular; "butonu göstermedik" bir güvenlik önlemi değildir.
 *
 * Bu katman RLS'in YERİNE geçmez, ONA EK'tir. Veritabanı son savunma hattıdır;
 * buradaki kontroller kullanıcıya anlamlı hata mesajı vermek ve gereksiz
 * sorguyu baştan kesmek içindir.
 */

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseSunucu } from "@/lib/supabase/server";

export type Rol = "ogrenci" | "ogretmen" | "veli" | "admin" | "mentor" | "rehber";

export interface Oturum {
  kullaniciId: string;
  ad: string;
  soyad: string;
  schoolId: string;
  okulSlug: string;
  roller: Rol[];
  sifreBelirlendiMi: boolean;
}

/**
 * Giriş yapmış kullanıcı, yoksa null.
 *
 * `cache()` ile sarılı: aynı istek içinde kaç kez çağrılırsa çağrılsın
 * veritabanına bir kez gidilir.
 */
export const oturum = cache(async (): Promise<Oturum | null> => {
  const supabase = await supabaseSunucu();

  // DİKKAT: getSession() değil getUser(). getSession() çerezdeki jetonu
  // doğrulamadan döner; getUser() jetonu Supabase'e doğrulatır.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, ad, soyad, school_id, durum, sifre_belirlendi_mi, schools(slug)")
    .eq("id", user.id)
    .single();

  if (!data || data.durum !== "aktif") return null;

  const { data: roller } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const okul = data.schools as unknown as { slug: string } | null;

  return {
    kullaniciId: data.id,
    ad: data.ad,
    soyad: data.soyad,
    schoolId: data.school_id,
    okulSlug: okul?.slug ?? "",
    roller: (roller ?? []).map((r) => r.role as Rol),
    sifreBelirlendiMi: data.sifre_belirlendi_mi,
  };
});

/** Giriş zorunlu. Yoksa giriş sayfasına yönlendirir. */
export async function oturumZorunlu(okulSlug: string): Promise<Oturum> {
  const o = await oturum();
  if (!o) redirect(`/${okulSlug}/giris`);
  if (o.okulSlug !== okulSlug) {
    // Kullanıcı başka bir okulun adresine gitti. Kendi okuluna yönlendir.
    redirect(`/${o.okulSlug}`);
  }
  if (!o.sifreBelirlendiMi) redirect(`/${okulSlug}/ilk-giris`);
  return o;
}

/** Belirli bir rol zorunlu. */
export async function rolZorunlu(okulSlug: string, ...roller: Rol[]): Promise<Oturum> {
  const o = await oturumZorunlu(okulSlug);
  if (!roller.some((r) => o.roller.includes(r))) {
    redirect(`/${okulSlug}`);
  }
  return o;
}

/**
 * Server Action'lar için: yönlendirme yerine hata fırlatır.
 * Action'lar arayüz dışından da çağrılabildiği için bu kontrol zorunludur.
 */
export async function actionYetkisi(...roller: Rol[]): Promise<Oturum> {
  const o = await oturum();
  if (!o) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
  if (!o.sifreBelirlendiMi) throw new Error("Önce şifrenizi belirlemelisiniz.");
  if (roller.length && !roller.some((r) => o.roller.includes(r))) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  return o;
}
