"use server";

/**
 * Çözemediği soru akışı: öğrenci sorar, öğretmen yanıtlar.
 *
 * Tek dosyada iki rol var ama her eylem kendi rolünü ayrıca doğruluyor —
 * `soruSor` öğrenciye, `yanitla` öğretmene kapalı değil, açık.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface SoruSonuc {
  hata?: string;
  basari?: string;
}

const idSemasi = z.string().uuid();

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/sorular`);
}

/**
 * Görsel YOLU alınıyor, dosyanın kendisi değil. Dosya tarayıcıdan doğrudan
 * Supabase Storage'a gidiyor; sunucudan geçseydi Vercel'in istek gövdesi
 * sınırına takılırdı ve 8 MB'lık bir fotoğraf iki kez ağdan geçerdi.
 *
 * Yolun uydurulamayacağını Storage politikası garanti ediyor (0020): öğrenci
 * yalnızca kendi klasörüne yazabiliyor, dolayısıyla buraya gelen yol ya
 * gerçekten yüklenmiş bir dosyayı gösterir ya da hiçbir şeyi.
 */
const yolSemasi = z
  .string()
  .regex(
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.[a-z0-9]+$/i,
    "Görsel yolu geçersiz.",
  )
  .or(z.literal(""))
  .optional();

const soruSemasi = z.object({
  metin: z.string().trim().min(10, "Soruyu biraz daha açıklar mısın?").max(2000),
  dersId: z.string().uuid().or(z.literal("")).optional(),
  hedefOgretmenId: z.string().uuid().or(z.literal("")).optional(),
  gorselYolu: yolSemasi,
});

export async function soruSor(okulSlug: string, girdi: unknown): Promise<SoruSonuc> {
  const oturum = await actionYetkisi("ogrenci");

  const sonuc = soruSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("unsolved_questions").insert({
    school_id: oturum.schoolId,
    student_id: oturum.kullaniciId,
    subject_id: sonuc.data.dersId || null,
    hedef_ogretmen_id: sonuc.data.hedefOgretmenId || null,
    metin: sonuc.data.metin,
    gorsel_yolu: sonuc.data.gorselYolu || null,
  });

  if (error) return { hata: "Soru gönderilemedi." };
  yenile(okulSlug);
  return { basari: "Sorun öğretmenlerine iletildi." };
}

const yanitSemasi = z.object({
  soruId: z.string().uuid(),
  metin: z.string().trim().min(5, "Yanıt çok kısa.").max(4000),
  gorselYolu: yolSemasi,
});

export async function yanitla(okulSlug: string, girdi: unknown): Promise<SoruSonuc> {
  const oturum = await actionYetkisi("ogretmen", "mentor", "rehber");

  const sonuc = yanitSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("question_answers").insert({
    school_id: oturum.schoolId,
    question_id: sonuc.data.soruId,
    teacher_id: oturum.kullaniciId,
    metin: sonuc.data.metin,
    gorsel_yolu: sonuc.data.gorselYolu || null,
  });

  if (error) {
    if (/row-level security/i.test(error.message)) {
      return { hata: "Bu soruyu yanıtlama yetkiniz yok." };
    }
    return { hata: "Yanıt kaydedilemedi." };
  }

  // Durum yanıt yazıldıktan SONRA güncelleniyor: yanıt yazılamazsa soru
  // "yanıtlandı" görünüp öğrenciyi boşuna beklentiye sokmamalı.
  await supabase
    .from("unsolved_questions")
    .update({ durum: "yanitlandi" })
    .eq("id", sonuc.data.soruId)
    .eq("durum", "bekliyor");

  yenile(okulSlug);
  return { basari: "Yanıtın öğrenciye iletildi." };
}

/** Öğrenci sorusunu kapatır: "anladım, teşekkürler". */
export async function soruyuKapat(okulSlug: string, soruId: string): Promise<SoruSonuc> {
  await actionYetkisi("ogrenci");
  if (!idSemasi.safeParse(soruId).success) return { hata: "Soru bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("unsolved_questions")
    .update({ durum: "kapandi" })
    .eq("id", soruId)
    .select("id");

  if (error) return { hata: "Soru kapatılamadı." };
  if (!data?.length) return { hata: "Yalnızca kendi sorunu kapatabilirsin." };

  yenile(okulSlug);
  return { basari: "Soru kapatıldı." };
}
