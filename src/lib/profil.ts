/**
 * Profil ekranının okuma katmanı.
 *
 * Kullanıcı kendi satırını RLS sayesinde zaten okuyabiliyor (users_kendisi_okur);
 * role özel alanlar (sınıf, branş, çocuklar) ayrı tablolardan geliyor ve her
 * biri yine kendi RLS politikasıyla korunuyor. Burada hiçbir yetki kontrolü
 * tekrarlanmıyor — sorgu neyi döndürebiliyorsa o gösteriliyor.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Oturum } from "@/lib/auth/oturum";

export interface Profil {
  ad: string;
  soyad: string;
  eposta: string | null;
  telefon: string | null;
  roller: string[];
  /** Rol başına değişen ek satırlar: "Sınıf: 11-A", "Branş: Matematik" ... */
  ayrintilar: { etiket: string; deger: string }[];
}

export async function profilOku(oturum: Oturum): Promise<Profil> {
  const supabase = await supabaseSunucu();

  const { data: kullanici, error } = await supabase
    .from("users")
    .select("ad, soyad, eposta, telefon")
    .eq("id", oturum.kullaniciId)
    .single();

  if (error) throw new Error(`Profil okunamadı: ${error.message}`);

  const ayrintilar: { etiket: string; deger: string }[] = [];

  if (oturum.roller.includes("ogrenci")) {
    const { data } = await supabase
      .from("students")
      .select("okul_no, classes(kod)")
      .eq("user_id", oturum.kullaniciId)
      .maybeSingle();
    if (data) {
      ayrintilar.push({ etiket: "Okul numarası", deger: data.okul_no });
      const sinif = data.classes as unknown as { kod: string } | null;
      if (sinif) ayrintilar.push({ etiket: "Sınıf", deger: sinif.kod });
    }
  }

  if (oturum.roller.includes("ogretmen")) {
    const { data } = await supabase
      .from("teachers")
      .select("subjects(ad)")
      .eq("user_id", oturum.kullaniciId)
      .maybeSingle();
    const brans = data?.subjects as unknown as { ad: string } | null;
    if (brans) ayrintilar.push({ etiket: "Branş", deger: brans.ad });
  }

  if (oturum.roller.includes("veli")) {
    const { data } = await supabase
      .from("v_velinin_ogrencileri")
      .select("ad, soyad, sinif_kodu");
    const cocuklar = (data ?? []).map(
      (o) => `${o.ad} ${o.soyad}${o.sinif_kodu ? ` (${o.sinif_kodu})` : ""}`,
    );
    if (cocuklar.length) {
      ayrintilar.push({ etiket: "Öğrenci", deger: cocuklar.join(", ") });
    }
  }

  return {
    ad: kullanici.ad,
    soyad: kullanici.soyad,
    eposta: kullanici.eposta,
    telefon: kullanici.telefon,
    roller: oturum.roller,
    ayrintilar,
  };
}
