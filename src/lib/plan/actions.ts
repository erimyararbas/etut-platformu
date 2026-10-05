"use server";

/**
 * Çalışma planı işlemleri.
 *
 * `lib/` altında duruyor çünkü İKİ AYRI PANELDEN çağrılıyor: rehberlik paneli
 * ve öğretmenin (mentörün) öğrenci takibi. Bir rolün klasörüne koysaydım
 * diğeri oradan import etmek zorunda kalırdı — o da "bu dosya kimin?"
 * sorusunu belirsizleştirirdi.
 *
 * Yetkiyi RLS belirliyor (`plan_yazabilir`, 0028): rehber ve öğrencinin
 * mentörü. Buradaki `actionYetkisi` çağrısı yalnızca kaba bir kapı; asıl
 * kural veritabanında ve RLS reddi kullanıcıya anlamlı mesaja çevriliyor.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface PlanSonuc {
  hata?: string;
  basari?: string;
  planId?: string;
}

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/rehberlik`);
  revalidatePath(`/${okulSlug}/ogretmen/calisma`);
  revalidatePath(`/${okulSlug}/ogrenci/calisma`);
  revalidatePath(`/${okulSlug}/ogrenci/takvim`);
}

const ogeSemasi = z.object({
  gun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gün geçersiz."),
  subjectId: z.string().uuid().or(z.literal("")).optional(),
  topicId: z.string().uuid().or(z.literal("")).optional(),
  hedefSoru: z.coerce.number().int().min(1).max(5000).optional().nullable(),
});

const planSemasi = z.object({
  ogrenciId: z.string().uuid(),
  haftaBasi: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hafta geçersiz."),
  notMetni: z.string().trim().max(1000).optional(),
  ogeler: z.array(ogeSemasi).min(1, "Plana en az bir satır ekleyin.").max(40),
});

/**
 * Planı yazar; o hafta için plan varsa ÜZERİNE YAZAR.
 *
 * Öğeler silinip yeniden yazılıyor. Bu, öğrencinin işaretlerini de siler —
 * ve bu doğru: plan değiştiyse eski satırların "yapıldı" işareti yeni plana
 * ait değildir. Arayüz düzenlemeden önce bunu söylüyor.
 */
export async function planKaydet(okulSlug: string, girdi: unknown): Promise<PlanSonuc> {
  const oturum = await actionYetkisi("rehber", "ogretmen", "mentor", "admin");

  const sonuc = planSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const g = sonuc.data;

  const supabase = await supabaseSunucu();

  const { data: plan, error: planHatasi } = await supabase
    .from("study_plans")
    .upsert(
      {
        school_id: oturum.schoolId,
        student_id: g.ogrenciId,
        hafta_basi: g.haftaBasi,
        olusturan: oturum.kullaniciId,
        not_metni: g.notMetni || null,
      },
      { onConflict: "student_id,hafta_basi" },
    )
    .select("id")
    .single();

  if (planHatasi || !plan) {
    if (planHatasi && /row-level security/i.test(planHatasi.message)) {
      return {
        hata: "Bu öğrenciye plan yazamazsınız — yalnızca rehber ve öğrencinin mentörü yazabilir.",
      };
    }
    return { hata: "Plan kaydedilemedi." };
  }

  await supabase.from("study_plan_items").delete().eq("plan_id", plan.id);

  const { error } = await supabase.from("study_plan_items").insert(
    g.ogeler.map((o, i) => ({
      school_id: oturum.schoolId,
      plan_id: plan.id,
      student_id: g.ogrenciId,
      gun: o.gun,
      subject_id: o.subjectId || null,
      topic_id: o.topicId || null,
      hedef_soru: o.hedefSoru ?? null,
      sira: i,
    })),
  );

  if (error) return { hata: "Plan satırları kaydedilemedi." };

  yenile(okulSlug);
  return { basari: "Plan kaydedildi.", planId: plan.id };
}

export async function planSil(okulSlug: string, planId: string): Promise<PlanSonuc> {
  await actionYetkisi("rehber", "ogretmen", "mentor", "admin");
  if (!z.string().uuid().safeParse(planId).success) return { hata: "Plan bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("study_plans")
    .delete()
    .eq("id", planId)
    .select("id");

  if (error) return { hata: "Plan silinemedi." };
  if (!data?.length) return { hata: "Bu planı silme yetkiniz yok." };

  yenile(okulSlug);
  return { basari: "Plan silindi." };
}

/**
 * Öğrenci bir plan satırını işaretler.
 *
 * Yalnızca `durum` ve `isaretlendi_at` yazılıyor — zaten kolon düzeyinde
 * GRANT başkasını kabul etmez (0028). Etkilenen satır sayısına bakılıyor:
 * RLS başkasının satırını sessizce süzer, hata vermez.
 */
export async function ogeIsaretle(
  okulSlug: string,
  ogeId: string,
  durum: "bekliyor" | "yapildi" | "yapilmadi",
): Promise<PlanSonuc> {
  await actionYetkisi("ogrenci");
  if (!z.string().uuid().safeParse(ogeId).success) return { hata: "Satır bulunamadı." };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("study_plan_items")
    .update({
      durum,
      isaretlendi_at: durum === "bekliyor" ? null : new Date().toISOString(),
    })
    .eq("id", ogeId)
    .select("id");

  if (error) return { hata: "İşaretlenemedi." };
  if (!data?.length) return { hata: "Bu satır sana ait değil." };

  yenile(okulSlug);
  return {};
}
