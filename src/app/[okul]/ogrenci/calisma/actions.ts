"use server";

/**
 * Çalışma sayacı ve hedef işlemleri.
 *
 * Öğrenci kimliği İSTEMCİDEN ALINMAZ, oturumdan okunur. RLS zaten başkası
 * adına yazmayı engelliyor (0017) ama isteği buraya kadar getirmeye gerek yok.
 *
 * Sayaç "aç–kapat" modeli: başlatınca bitiş boş bir satır açılır, sayılar
 * üzerine yazılır, bitirince süre hesaplanır. Aynı anda ikinci sayaç
 * veritabanındaki tekil dizin tarafından reddedilir — kontrol uygulamada
 * değil, orada.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { bugun } from "@/lib/etut/kurallar";

export interface CalismaSonuc {
  hata?: string;
  basari?: string;
}

const idSemasi = z.string().uuid();

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/ogrenci/calisma`);
}

export async function sayacBaslat(
  okulSlug: string,
  hedefId: string | null,
): Promise<CalismaSonuc> {
  const oturum = await actionYetkisi("ogrenci");
  if (hedefId && !idSemasi.safeParse(hedefId).success) {
    return { hata: "Hedef bulunamadı." };
  }

  const supabase = await supabaseSunucu();

  // Hedefin dersi/konusu oturuma kopyalanıyor ki hedef sonradan silinse bile
  // çalışmanın hangi derse ait olduğu kaybolmasın.
  let dersId: string | null = null;
  let konuId: string | null = null;
  if (hedefId) {
    const { data } = await supabase
      .from("study_goals")
      .select("subject_id, topic_id")
      .eq("id", hedefId)
      .maybeSingle();
    dersId = data?.subject_id ?? null;
    konuId = data?.topic_id ?? null;
  }

  const { error } = await supabase.from("study_sessions").insert({
    school_id: oturum.schoolId,
    student_id: oturum.kullaniciId,
    goal_id: hedefId,
    subject_id: dersId,
    topic_id: konuId,
    calisma_gunu: bugun(),
  });

  if (error) {
    // Tekil dizin ihlali: zaten açık bir sayaç var.
    if (/duplicate key|tek_acik/i.test(error.message)) {
      return { hata: "Zaten açık bir sayacın var. Önce onu bitir." };
    }
    return { hata: "Sayaç başlatılamadı." };
  }

  yenile(okulSlug);
  return { basari: "Sayaç başladı." };
}

const sayimSemasi = z.object({
  dogru: z.coerce.number().int().min(0).max(9999),
  yanlis: z.coerce.number().int().min(0).max(9999),
  bos: z.coerce.number().int().min(0).max(9999),
});

/** Sayaç açıkken sayıları günceller. */
export async function sayimKaydet(
  okulSlug: string,
  oturumId: string,
  girdi: unknown,
): Promise<CalismaSonuc> {
  await actionYetkisi("ogrenci");
  if (!idSemasi.safeParse(oturumId).success) return { hata: "Kayıt bulunamadı." };

  const sonuc = sayimSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: "Sayılar geçersiz." };

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("study_sessions")
    .update(sonuc.data)
    .eq("id", oturumId);

  if (error) return { hata: "Kaydedilemedi." };
  yenile(okulSlug);
  return {};
}

export async function sayacBitir(
  okulSlug: string,
  oturumId: string,
  girdi: unknown,
  not?: string,
): Promise<CalismaSonuc> {
  await actionYetkisi("ogrenci");
  if (!idSemasi.safeParse(oturumId).success) return { hata: "Kayıt bulunamadı." };

  const sonuc = sayimSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: "Sayılar geçersiz." };

  const supabase = await supabaseSunucu();

  const { data: mevcut } = await supabase
    .from("study_sessions")
    .select("basladi_at")
    .eq("id", oturumId)
    .maybeSingle();

  if (!mevcut) return { hata: "Kayıt bulunamadı." };

  const bitti = new Date();
  const saniye = Math.max(
    0,
    Math.round((bitti.getTime() - new Date(mevcut.basladi_at).getTime()) / 1000),
  );

  const { error } = await supabase
    .from("study_sessions")
    .update({
      ...sonuc.data,
      bitti_at: bitti.toISOString(),
      sure_saniye: saniye,
      not_metni: not?.trim() ? not.trim().slice(0, 500) : null,
    })
    .eq("id", oturumId);

  if (error) return { hata: "Sayaç bitirilemedi." };
  yenile(okulSlug);
  return { basari: "Çalışman kaydedildi." };
}

/** Yanlış başlatılmış sayacı iz bırakmadan kaldırır. */
export async function sayaciIptalEt(
  okulSlug: string,
  oturumId: string,
): Promise<CalismaSonuc> {
  await actionYetkisi("ogrenci");
  if (!idSemasi.safeParse(oturumId).success) return { hata: "Kayıt bulunamadı." };

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", oturumId)
    // Yalnızca açık sayaç silinebilir; bitmiş çalışma geçmişi silinmemeli.
    .is("bitti_at", null);

  if (error) return { hata: "Sayaç iptal edilemedi." };
  yenile(okulSlug);
  return { basari: "Sayaç iptal edildi." };
}

const hedefSemasi = z.object({
  baslik: z.string().trim().min(3, "Hedefe kısa bir ad ver.").max(120),
  hedefSoru: z.coerce.number().int().min(1, "En az 1 soru.").max(10_000),
  dersId: z.string().uuid().nullable().optional(),
  konuId: z.string().uuid().nullable().optional(),
  sonTarih: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional(),
});

/** Öğrencinin kendine koyduğu hedef. `assigned_by` bilerek boş. */
export async function hedefEkle(okulSlug: string, girdi: unknown): Promise<CalismaSonuc> {
  const oturum = await actionYetkisi("ogrenci");

  const sonuc = hedefSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const h = sonuc.data;

  const supabase = await supabaseSunucu();
  const { error } = await supabase.from("study_goals").insert({
    school_id: oturum.schoolId,
    student_id: oturum.kullaniciId,
    baslik: h.baslik,
    hedef_soru: h.hedefSoru,
    subject_id: h.dersId ?? null,
    topic_id: h.konuId ?? null,
    son_tarih: h.sonTarih || null,
  });

  if (error) return { hata: "Hedef eklenemedi." };
  yenile(okulSlug);
  return { basari: "Hedef eklendi." };
}

export async function hedefDurumu(
  okulSlug: string,
  hedefId: string,
  durum: "aktif" | "tamamlandi" | "iptal",
): Promise<CalismaSonuc> {
  await actionYetkisi("ogrenci");
  if (!idSemasi.safeParse(hedefId).success) return { hata: "Hedef bulunamadı." };

  const supabase = await supabaseSunucu();
  // RLS öğretmenin atadığı hedefi öğrencinin değiştirmesine izin vermez;
  // burada hata dönmemesi için etkilenen satır sayısına bakıyoruz.
  const { data, error } = await supabase
    .from("study_goals")
    .update({ durum, updated_at: new Date().toISOString() })
    .eq("id", hedefId)
    .select("id");

  if (error) return { hata: "Hedef güncellenemedi." };
  if (!data?.length) {
    return { hata: "Öğretmeninin verdiği hedefi kapatamazsın." };
  }

  yenile(okulSlug);
  return { basari: durum === "tamamlandi" ? "Hedef tamamlandı." : "Hedef güncellendi." };
}
