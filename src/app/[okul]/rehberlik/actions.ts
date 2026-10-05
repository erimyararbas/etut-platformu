"use server";

/**
 * Rehberlik işlemleri.
 *
 * Her eylem `rehber` rolünü şart koşuyor — `is_staff()` DEĞİL. Uygulamanın
 * geri kalanında yönetici her şeyi yapabilir; burada yapamaz (bkz. 0023).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface RehberlikSonuc {
  hata?: string;
  basari?: string;
}

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/rehberlik`);
}

const vakaSemasi = z.object({
  ogrenciId: z.string().uuid(),
  baslik: z.string().trim().min(3, "Vakaya kısa bir başlık verin.").max(120),
  oncelik: z.enum(["dusuk", "normal", "yuksek"]).default("normal"),
});

export async function vakaAc(okulSlug: string, girdi: unknown): Promise<RehberlikSonuc> {
  const oturum = await actionYetkisi("rehber");

  const sonuc = vakaSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("counseling_cases").insert({
    school_id: oturum.schoolId,
    student_id: sonuc.data.ogrenciId,
    acan: oturum.kullaniciId,
    baslik: sonuc.data.baslik,
    oncelik: sonuc.data.oncelik,
  });

  if (error) return { hata: "Vaka açılamadı." };
  yenile(okulSlug);
  return { basari: "Vaka açıldı." };
}

export async function vakaDurumu(
  okulSlug: string,
  vakaId: string,
  durum: "acik" | "izlemede" | "kapandi",
  kapanisOzeti?: string,
): Promise<RehberlikSonuc> {
  await actionYetkisi("rehber");
  if (!z.string().uuid().safeParse(vakaId).success) return { hata: "Vaka bulunamadı." };

  if (durum === "kapandi" && !kapanisOzeti?.trim()) {
    return { hata: "Vakayı kapatırken kısa bir kapanış özeti yazın." };
  }

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("counseling_cases")
    .update({
      durum,
      kapanis_ozeti: durum === "kapandi" ? kapanisOzeti!.trim().slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vakaId);

  if (error) return { hata: "Vaka güncellenemedi." };
  yenile(okulSlug);
  return { basari: "Vaka güncellendi." };
}

const notSemasi = z.object({
  vakaId: z.string().uuid(),
  metin: z.string().trim().min(3, "Not boş olamaz.").max(4000),
  /**
   * 'rehber' her zaman eklenir — görünürlükten çıkarılamaz (0023'teki CHECK).
   * Buradan gelen liste yalnızca EK rolleri belirler.
   */
  paylas: z.array(z.enum(["mentor", "ogretmen", "veli"])).default([]),
  yalnizcaYazan: z.boolean().default(false),
});

export async function notEkle(okulSlug: string, girdi: unknown): Promise<RehberlikSonuc> {
  const oturum = await actionYetkisi("rehber");

  const sonuc = notSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  // "Yalnızca ben" ile paylaşım birbirini dışlar; ikisi birden seçilirse
  // hangisinin geçerli olduğu belirsiz kalırdı.
  if (sonuc.data.yalnizcaYazan && sonuc.data.paylas.length > 0) {
    return { hata: "Bir not ya yalnızca size özel olur ya da paylaşılır." };
  }

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("case_notes").insert({
    school_id: oturum.schoolId,
    case_id: sonuc.data.vakaId,
    yazan: oturum.kullaniciId,
    metin: sonuc.data.metin,
    gorunurluk: ["rehber", ...sonuc.data.paylas],
    yalnizca_yazan: sonuc.data.yalnizcaYazan,
  });

  if (error) return { hata: "Not kaydedilemedi." };
  yenile(okulSlug);
  return { basari: "Not kaydedildi." };
}

const planSemasi = z.object({
  randevuId: z.string().uuid(),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih geçersiz."),
  baslangic: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat geçersiz."),
  tur: z.enum(["bireysel", "veli", "grup"]).default("bireysel"),
});

export async function randevuPlanla(
  okulSlug: string,
  girdi: unknown,
): Promise<RehberlikSonuc> {
  const oturum = await actionYetkisi("rehber");

  const sonuc = planSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      durum: "planlandi",
      tarih: sonuc.data.tarih,
      baslangic: sonuc.data.baslangic,
      tur: sonuc.data.tur,
      rehber_id: oturum.kullaniciId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sonuc.data.randevuId)
    .select("id");

  if (error) return { hata: `Randevu planlanamadı: ${error.message}` };
  if (!data?.length) return { hata: "Randevu bulunamadı." };

  yenile(okulSlug);
  return { basari: "Randevu planlandı." };
}

export async function randevuReddet(
  okulSlug: string,
  randevuId: string,
  neden: string,
): Promise<RehberlikSonuc> {
  await actionYetkisi("rehber");
  if (!z.string().uuid().safeParse(randevuId).success) return { hata: "Randevu bulunamadı." };
  if (!neden.trim()) return { hata: "Kısa bir gerekçe yazın; veliye iletilecek." };

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("appointments")
    .update({
      durum: "iptal",
      ret_nedeni: neden.trim().slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", randevuId);

  if (error) return { hata: "Randevu reddedilemedi." };
  yenile(okulSlug);
  return { basari: "Talep reddedildi." };
}

/** Veli veya öğrenci randevu talebi açar. */
export async function randevuTalepEt(
  okulSlug: string,
  ogrenciId: string,
  notMetni: string,
): Promise<RehberlikSonuc> {
  const oturum = await actionYetkisi("veli", "ogrenci");
  if (!z.string().uuid().safeParse(ogrenciId).success) return { hata: "Öğrenci bulunamadı." };

  const temiz = notMetni.trim();
  if (temiz.length < 10) {
    return { hata: "Görüşmek istediğiniz konuyu kısaca yazın." };
  }

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("appointments").insert({
    school_id: oturum.schoolId,
    student_id: ogrenciId,
    talep_eden: oturum.kullaniciId,
    talep_notu: temiz.slice(0, 500),
  });

  if (error) {
    if (/row-level security/i.test(error.message)) {
      return { hata: "Bu öğrenci için talep açma yetkiniz yok." };
    }
    return { hata: "Talep gönderilemedi." };
  }

  revalidatePath(`/${okulSlug}`, "layout");
  return { basari: "Talebiniz rehberlik servisine iletildi." };
}
