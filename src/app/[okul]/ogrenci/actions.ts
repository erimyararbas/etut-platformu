"use server";

/**
 * Öğrenci rezervasyon işlemleri.
 *
 * Hiçbiri `reservations` tablosuna doğrudan yazmaz — yazma yetkisi kimsede yok
 * (bkz. 0005_yetkiler.sql). Tek giriş noktası veritabanı fonksiyonlarıdır;
 * kontenjan kilidi, bekleme listesi sırası ve otomatik yükseltme orada.
 *
 * Öğrenci kimliği İSTEMCİDEN ALINMAZ: oturumdan okunur. Aksi hâlde bir öğrenci
 * başkasının adına işlem yapmayı deneyebilirdi (veritabanı fonksiyonu bunu
 * zaten reddeder, ama isteği buraya kadar getirmeye gerek yok).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { actionYetkisi } from "@/lib/auth/oturum";

export interface RezervasyonDurumuSonuc {
  hata?: string;
  basari?: string;
}

const etutIdSemasi = z.string().uuid();

/** Veritabanının teknik hatasını öğrencinin anlayacağı dile çevirir. */
function mesaja(hata: string): string {
  const eslesmeler: [RegExp, string][] = [
    [/zaten kayıtlısınız/i, "Bu etüde zaten kayıtlısın."],
    [/sınıfınıza açık değil/i, "Bu etüt senin sınıfına açık değil."],
    [/başka bir etüde kayıtlısınız/i, "Aynı saatte başka bir etüde kayıtlısın."],
    [/Rezervasyon dönemi kapalı/i, "Bu etüdün rezervasyon dönemi kapalı."],
    [/rezervasyona kapalı/i, "Bu etüt rezervasyona kapalı."],
    [/Sınıf etüdünden kendiniz çıkamazsınız/i, "Sınıf etüdünden çıkmak için öğretmen onayı gerekir."],
    [/Aktif bir rezervasyon yok/i, "Bu etütte kaydın görünmüyor."],
    [/yetkiniz yok/i, "Bu işlem için yetkin yok."],
  ];
  for (const [desen, metin] of eslesmeler) if (desen.test(hata)) return metin;
  return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}

export async function etudeKatil(
  okulSlug: string,
  etutId: string,
): Promise<RezervasyonDurumuSonuc> {
  const oturum = await actionYetkisi("ogrenci");
  if (!etutIdSemasi.safeParse(etutId).success) return { hata: "Etüt bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("rezervasyon_yap", {
    p_etut_id: etutId,
    p_student_id: oturum.kullaniciId,
  });

  if (error) return { hata: mesaja(error.message) };

  const sonuc = (data as { durum: string; sira_no: number | null }[] | null)?.[0];
  revalidatePath(`/${okulSlug}/ogrenci`);

  if (sonuc?.durum === "beklemede") {
    return { basari: `Kontenjan dolu — bekleme listesinde ${sonuc.sira_no}. sıradasın.` };
  }
  return { basari: "Etüde kaydın alındı." };
}

export async function kaydiBirak(
  okulSlug: string,
  etutId: string,
): Promise<RezervasyonDurumuSonuc> {
  const oturum = await actionYetkisi("ogrenci");
  if (!etutIdSemasi.safeParse(etutId).success) return { hata: "Etüt bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("rezervasyon_birak", {
    p_etut_id: etutId,
    p_student_id: oturum.kullaniciId,
  });

  if (error) return { hata: mesaja(error.message) };
  revalidatePath(`/${okulSlug}/ogrenci`);

  // Fonksiyon, yerine geçen öğrencinin kimliğini döner (varsa).
  return {
    basari: data
      ? "Kaydın iptal edildi. Boşalan yer bekleme listesindeki öğrenciye verildi."
      : "Kaydın iptal edildi.",
  };
}

export async function iptalTalebiGonder(
  okulSlug: string,
  etutId: string,
  neden: string,
): Promise<RezervasyonDurumuSonuc> {
  const oturum = await actionYetkisi("ogrenci");
  if (!etutIdSemasi.safeParse(etutId).success) return { hata: "Etüt bulunamadı." };

  const temiz = neden.trim();
  if (temiz.length < 3) return { hata: "Kısa bir gerekçe yaz — öğretmenin değerlendirmesi gerekiyor." };

  const supabase = await supabaseSunucu();
  const { error } = await supabase.rpc("iptal_talebi_olustur", {
    p_etut_id: etutId,
    p_student_id: oturum.kullaniciId,
    p_neden: temiz.slice(0, 500),
  });

  if (error) return { hata: mesaja(error.message) };
  revalidatePath(`/${okulSlug}/ogrenci`);
  return { basari: "İptal talebin öğretmenine iletildi." };
}
