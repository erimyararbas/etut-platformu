"use server";

/**
 * Mentör onay kuyruğu işlemleri.
 *
 * Öğrenci gönderir, personel karar verir. `karar_veren` daima oturumdaki
 * kullanıcı — istemciden alınmıyor ve RLS de aynısını şart koşuyor (0022),
 * yani biri atlansa diğeri tutar.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface GonderiSonuc {
  hata?: string;
  basari?: string;
}

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/gonderiler`);
}

const gonderSemasi = z.object({
  aciklama: z
    .string()
    .trim()
    .min(5, "Ne çalıştığını kısaca yaz.")
    .max(500),
  // Fotoğraf ZORUNLU: onay kuyruğunun tamamı fotoğrafı görmeye dayanıyor.
  gorselYolu: z
    .string()
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.[a-z0-9]+$/i,
      "Önce çalışmanın fotoğrafını ekle.",
    ),
  hedefId: z.string().uuid().or(z.literal("")).optional(),
});

export async function gonderiYolla(okulSlug: string, girdi: unknown): Promise<GonderiSonuc> {
  const oturum = await actionYetkisi("ogrenci");

  const sonuc = gonderSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();

  // Muhatabı öğrencinin mentörü; yoksa boş kalır ve kuyruk okulun personeline
  // açık olur (bkz. 0022'deki bildirim tetikleyicisi).
  const { data: ogrenci } = await supabase
    .from("students")
    .select("mentor_teacher_id")
    .eq("user_id", oturum.kullaniciId)
    .maybeSingle();

  const { error } = await supabase.from("mentor_submissions").insert({
    school_id: oturum.schoolId,
    student_id: oturum.kullaniciId,
    mentor_id: ogrenci?.mentor_teacher_id ?? null,
    goal_id: sonuc.data.hedefId || null,
    aciklama: sonuc.data.aciklama,
    gorsel_yolu: sonuc.data.gorselYolu,
  });

  if (error) return { hata: "Gönderilemedi. Lütfen tekrar dene." };

  yenile(okulSlug);
  return { basari: "Çalışman mentörüne gönderildi." };
}

const kararSemasi = z.object({
  gonderiId: z.string().uuid(),
  onay: z.boolean(),
  not: z.string().trim().max(500).optional(),
});

export async function kararVer(okulSlug: string, girdi: unknown): Promise<GonderiSonuc> {
  const oturum = await actionYetkisi("ogretmen", "mentor", "rehber", "admin");

  const sonuc = kararSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: "Karar kaydedilemedi." };

  // Geri gönderirken gerekçe zorunlu: öğrenci neyi düzelteceğini bilmeli.
  if (!sonuc.data.onay && !sonuc.data.not) {
    return { hata: "Geri gönderirken kısa bir gerekçe yazın." };
  }

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("mentor_submissions")
    .update({
      durum: sonuc.data.onay ? "onaylandi" : "reddedildi",
      karar_notu: sonuc.data.not || null,
      karar_veren: oturum.kullaniciId,
      karar_at: new Date().toISOString(),
    })
    .eq("id", sonuc.data.gonderiId)
    // Karar verilmiş gönderi yeniden karara açılmaz.
    .eq("durum", "bekliyor")
    .select("id");

  if (error) return { hata: "Karar kaydedilemedi." };
  if (!data?.length) return { hata: "Bu gönderi için karar zaten verilmiş." };

  yenile(okulSlug);
  return { basari: sonuc.data.onay ? "Onaylandı." : "Öğrenciye geri gönderildi." };
}
