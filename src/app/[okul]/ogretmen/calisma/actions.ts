"use server";

/**
 * Öğretmenin öğrenciye hedef ataması.
 *
 * `assigned_by` daima oturumdaki öğretmen; istemciden alınmıyor. RLS de aynısını
 * şart koşuyor (0017) — biri atlanırsa diğeri tutar.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface HedefSonuc {
  hata?: string;
  basari?: string;
}

const semasi = z.object({
  ogrenciId: z.string().uuid(),
  baslik: z.string().trim().min(3, "Hedefe kısa bir ad verin.").max(120),
  hedefSoru: z.coerce.number().int().min(1, "En az 1 soru.").max(10_000),
  dersId: z.string().uuid().or(z.literal("")).optional(),
  konuId: z.string().uuid().or(z.literal("")).optional(),
  sonTarih: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional(),
});

export async function hedefAta(okulSlug: string, girdi: unknown): Promise<HedefSonuc> {
  const oturum = await actionYetkisi("ogretmen", "mentor", "rehber", "admin");

  const sonuc = semasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const h = sonuc.data;

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("study_goals").insert({
    school_id: oturum.schoolId,
    student_id: h.ogrenciId,
    assigned_by: oturum.kullaniciId,
    baslik: h.baslik,
    hedef_soru: h.hedefSoru,
    subject_id: h.dersId || null,
    topic_id: h.konuId || null,
    son_tarih: h.sonTarih || null,
  });

  if (error) {
    // RLS reddi burada da anlamlı bir mesaja çevriliyor; ham Postgres hatası
    // öğretmene hiçbir şey anlatmaz.
    if (/row-level security/i.test(error.message)) {
      return { hata: "Bu öğrenciye hedef atama yetkiniz yok." };
    }
    return { hata: "Hedef atanamadı." };
  }

  revalidatePath(`/${okulSlug}/ogretmen/calisma`);
  return { basari: "Hedef atandı." };
}

export async function hedefiIptalEt(
  okulSlug: string,
  hedefId: string,
): Promise<HedefSonuc> {
  await actionYetkisi("ogretmen", "mentor", "rehber", "admin");
  if (!z.string().uuid().safeParse(hedefId).success) return { hata: "Hedef bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("study_goals")
    .update({ durum: "iptal", updated_at: new Date().toISOString() })
    .eq("id", hedefId)
    .select("id");

  if (error) return { hata: "Hedef iptal edilemedi." };
  if (!data?.length) return { hata: "Yalnızca kendi atadığınız hedefi iptal edebilirsiniz." };

  revalidatePath(`/${okulSlug}/ogretmen/calisma`);
  return { basari: "Hedef iptal edildi." };
}
