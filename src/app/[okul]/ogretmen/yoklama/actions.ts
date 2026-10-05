"use server";

/**
 * Yoklama, değerlendirme ve iptal talebi kararları.
 *
 * Yoklamanın zaman kilidi burada DEĞİL, veritabanındaki `attendance_kilit`
 * tetikleyicisindedir. Buradaki kontroller kullanıcıya anlamlı hata vermek
 * içindir; asıl engel her hâlükârda veritabanında.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { actionYetkisi } from "@/lib/auth/oturum";
import { denetimYaz } from "@/lib/denetim";
import { HAZIR_YORUMLAR } from "@/lib/etut/yoklama-gorunum";

export interface IslemSonucu {
  hata?: string;
  basari?: string;
}

const uuid = z.string().uuid();

/** Etüdün gerçekten bu öğretmene ait olduğunu doğrular. */
async function etudumMu(
  supabase: Awaited<ReturnType<typeof supabaseSunucu>>,
  etutId: string,
  ogretmenId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("etuts")
    .select("id")
    .eq("id", etutId)
    .eq("teacher_id", ogretmenId)
    .maybeSingle();
  return Boolean(data);
}

function yoklamaMesaji(hata: string): string {
  if (/Yoklama süresi doldu/i.test(hata)) {
    return "Yoklama süresi doldu. Düzeltme için okul yönetimine başvurun.";
  }
  if (/row-level security|permission denied/i.test(hata)) {
    return "Bu etüt için yoklama alma yetkiniz yok.";
  }
  return `Kaydedilemedi: ${hata}`;
}

/**
 * Tüm sınıfın yoklamasını tek seferde kaydeder.
 *
 * Toplu yazılır: 30 kişilik bir sınıfta satır satır göndermek Frankfurt'a
 * 30 gidiş-dönüş demek olurdu.
 */
export async function yoklamaKaydet(
  okulSlug: string,
  etutId: string,
  isaretler: Record<string, "katildi" | "devamsiz" | "mazeretli">,
): Promise<IslemSonucu> {
  const oturum = await actionYetkisi("ogretmen");
  if (!uuid.safeParse(etutId).success) return { hata: "Etüt bulunamadı." };

  const supabase = await supabaseSunucu();
  if (!(await etudumMu(supabase, etutId, oturum.kullaniciId))) {
    return { hata: "Bu etüt size ait değil." };
  }

  const satirlar = Object.entries(isaretler)
    .filter(([ogrenciId]) => uuid.safeParse(ogrenciId).success)
    .map(([ogrenciId, durum]) => ({
      school_id: oturum.schoolId,
      etut_id: etutId,
      student_id: ogrenciId,
      durum,
      marked_by: oturum.kullaniciId,
      marked_at: new Date().toISOString(),
    }));

  if (!satirlar.length) return { hata: "İşaretlenmiş öğrenci yok." };

  const { error } = await supabase
    .from("attendance")
    .upsert(satirlar, { onConflict: "etut_id,student_id" });

  if (error) return { hata: yoklamaMesaji(error.message) };

  revalidatePath(`/${okulSlug}/ogretmen/yoklama`);

  const devamsiz = satirlar.filter((s) => s.durum === "devamsiz").length;
  return {
    basari:
      devamsiz > 0
        ? `Yoklama kaydedildi · ${satirlar.length - devamsiz} katıldı, ${devamsiz} devamsız.`
        : `Yoklama kaydedildi · ${satirlar.length} öğrencinin tamamı katıldı.`,
  };
}

const degerlendirmeSemasi = z.object({
  etutId: uuid,
  ogrenciId: uuid,
  yildiz: z.coerce.number().int().min(1).max(5),
  yorum: z.string().max(1000).optional(),
});

export async function degerlendirmeKaydet(
  okulSlug: string,
  etutId: string,
  ogrenciId: string,
  yildiz: number,
  hazirSecimler: string[],
  yorum: string,
): Promise<IslemSonucu> {
  const oturum = await actionYetkisi("ogretmen");

  const girdi = degerlendirmeSemasi.safeParse({ etutId, ogrenciId, yildiz, yorum });
  if (!girdi.success) return { hata: "Yıldız puanı 1 ile 5 arasında olmalı." };

  const supabase = await supabaseSunucu();
  if (!(await etudumMu(supabase, etutId, oturum.kullaniciId))) {
    return { hata: "Bu etüt size ait değil." };
  }

  // Hazır yorumlar listeden gelmeli; istemciden serbest metin kabul etmiyoruz.
  const hazir = hazirSecimler.filter((h) =>
    (HAZIR_YORUMLAR as readonly string[]).includes(h),
  );

  const { error } = await supabase.from("evaluations").upsert(
    {
      school_id: oturum.schoolId,
      etut_id: etutId,
      student_id: ogrenciId,
      teacher_id: oturum.kullaniciId,
      yildiz: girdi.data.yildiz,
      hazir_yorumlar: hazir,
      yorum: girdi.data.yorum?.trim() || null,
    },
    { onConflict: "etut_id,student_id" },
  );

  if (error) return { hata: `Kaydedilemedi: ${error.message}` };

  revalidatePath(`/${okulSlug}/ogretmen/yoklama`);
  return { basari: "Değerlendirme kaydedildi." };
}

/**
 * Öğrencinin sınıf etüdünden çıkma talebini karara bağlar.
 *
 * `rezervasyon_birak` kullanılamaz: o fonksiyon 'atandi' durumundakini bilerek
 * reddeder. Bu yüzden 0026'da kendi SECURITY DEFINER fonksiyonu var.
 *
 * DOĞRUDAN UPDATE ATILMIYOR ve atılamaz: `authenticated` rolünün
 * `reservations` üzerinde yalnızca SELECT yetkisi var (0005). Bu kod bir
 * dönem doğrudan UPDATE atıyordu ve üretimde sessizce başarısız oluyordu —
 * GRANT olmadan RLS hiç devreye girmez. Yetkiyi genişletmek yerine yazma
 * yolu fonksiyona taşındı, çünkü kontenjan ve bekleme listesi mantığının
 * atlanabildiği bir ikinci yol istemiyoruz.
 */
export async function iptalTalebiKarar(
  okulSlug: string,
  etutId: string,
  ogrenciId: string,
  onay: boolean,
): Promise<IslemSonucu> {
  const oturum = await actionYetkisi("ogretmen");
  if (!uuid.safeParse(etutId).success || !uuid.safeParse(ogrenciId).success) {
    return { hata: "Kayıt bulunamadı." };
  }

  const supabase = await supabaseSunucu();
  if (!(await etudumMu(supabase, etutId, oturum.kullaniciId))) {
    return { hata: "Bu etüt size ait değil." };
  }

  const { data, error } = await supabase.rpc("iptal_talebi_karar", {
    p_etut_id: etutId,
    p_student_id: ogrenciId,
    p_onay: onay,
  });

  if (error) {
    if (/zaten karara bağlanmış/i.test(error.message)) {
      return { hata: "Bu talep zaten karara bağlanmış." };
    }
    return { hata: `İşlenemedi: ${error.message}` };
  }

  // Fonksiyon, yer boşalınca yükseltilen öğrencinin kimliğini döndürür.
  const yukselen = (data as string | null) ?? null;

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: onay ? "iptal_talebi.onayla" : "iptal_talebi.reddet",
    entity: "reservations",
    entityId: etutId,
    sonrasi: { ogrenci: ogrenciId, onay, yukselen },
  });

  revalidatePath(`/${okulSlug}/ogretmen/yoklama`);

  if (!onay) {
    return { basari: "İptal talebi reddedildi, öğrencinin kaydı duruyor." };
  }
  return {
    basari: yukselen
      ? "İptal talebi onaylandı; boşalan yere bekleme listesindeki öğrenci alındı."
      : "İptal talebi onaylandı, öğrencinin kaydı düşürüldü.",
  };
}
