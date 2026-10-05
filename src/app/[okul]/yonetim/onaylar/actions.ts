"use server";

/**
 * Etüt onay işlemleri.
 *
 * Prototipte yönetici onaylamadan önce kontenjan, saat ve konuyu
 * düzenleyebiliyordu; burada da öyle: onay formu düzenlenebilir alanlar içerir
 * ve kaydedilen değer onaylanan değerdir.
 *
 * Her değişiklik denetim kaydına yazılır — kimin neyi ne zaman değiştirdiği
 * sonradan sorulabilsin diye.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { actionYetkisi } from "@/lib/auth/oturum";
import { araligiDogrula, kontenjanHesapla } from "@/lib/etut/kurallar";
import { denetimYaz } from "@/lib/denetim";

export interface OnayDurumu {
  hata?: string;
  basari?: string;
}

const onaySemasi = z.object({
  etutId: z.string().uuid(),
  kontenjan: z.coerce.number().int().min(1).max(500),
  baslangic: z.string().min(1),
  bitis: z.string().min(1),
  konuId: z.string().uuid().optional().or(z.literal("")),
});

export async function etudiOnayla(
  okulSlug: string,
  _onceki: OnayDurumu,
  formData: FormData,
): Promise<OnayDurumu> {
  const oturum = await actionYetkisi("admin");

  const girdi = onaySemasi.safeParse({
    etutId: formData.get("etutId"),
    kontenjan: formData.get("kontenjan"),
    baslangic: formData.get("baslangic"),
    bitis: formData.get("bitis"),
    konuId: formData.get("konuId") ?? "",
  });
  if (!girdi.success) return { hata: "Form eksik veya hatalı." };
  const g = girdi.data;

  const aralik = araligiDogrula(g.baslangic, g.bitis);
  if ("hata" in aralik) return { hata: aralik.hata };

  const supabase = await supabaseSunucu();

  const { data: oncesi } = await supabase
    .from("etuts")
    .select("id, kontenjan, baslangic, bitis, topic_id, durum, sinif_etudu_mu, etut_types(ad)")
    .eq("id", g.etutId)
    .maybeSingle();

  if (!oncesi) return { hata: "Etüt bulunamadı." };
  if (oncesi.durum !== "onay_bekliyor") {
    return { hata: "Bu etüt zaten karara bağlanmış." };
  }

  /**
   * Kontenjan kuralı ONAY EKRANINDA DA geçerli. Bu ekran kontenjanı
   * düzenlemeye izin veriyor; burada zorlanmazsa birebir etüdün kontenjanı
   * onay sırasında 12 yapılabilir ve kural sessizce delinir.
   *
   * `etut_types` bire-bir gömülü ilişki olduğu için PostgREST DİZİ değil NESNE
   * döndürür (bkz. students embed'inde aynı tuzak); iki biçimi de karşılıyoruz.
   */
  const turKaydi = oncesi.etut_types as { ad: string } | { ad: string }[] | null;
  const turAdi = Array.isArray(turKaydi) ? (turKaydi[0]?.ad ?? null) : (turKaydi?.ad ?? null);
  const kontenjan = kontenjanHesapla(
    // Sınıf etüdünün kontenjanı zaten atanan öğrenci sayısına eşitlenmiş;
    // yöneticinin girdiği değeri değil, mevcut değeri korumak gerekiyor.
    false,
    oncesi.sinif_etudu_mu ? oncesi.kontenjan : g.kontenjan,
    0,
    oncesi.sinif_etudu_mu ? null : turAdi,
  );

  const sonrasi = {
    kontenjan,
    baslangic: g.baslangic,
    bitis: g.bitis,
    topic_id: g.konuId || null,
    durum: "onaylandi" as const,
    approved_by: oturum.kullaniciId,
    approved_at: new Date().toISOString(),
    red_nedeni: null,
  };

  const { error } = await supabase.from("etuts").update(sonrasi).eq("id", g.etutId);
  if (error) {
    // Saat değiştirilmişse çakışma kısıtına takılabilir.
    if (error.message.includes("etuts_ogretmen_cakismasi")) {
      return { hata: "Öğretmenin o saatte başka etüdü var. Saati değiştirin." };
    }
    if (error.message.includes("etuts_derslik_cakismasi")) {
      return { hata: "Derslik o saatte başka bir etüde ayrılmış." };
    }
    if (error.message.includes("derslik kapasitesini")) return { hata: error.message };
    return { hata: `Onaylanamadı: ${error.message}` };
  }

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "etut.onayla",
    entity: "etuts",
    entityId: g.etutId,
    oncesi,
    sonrasi,
  });

  revalidatePath(`/${okulSlug}/yonetim/onaylar`);
  return { basari: "Etüt onaylandı ve öğrencilere açıldı." };
}

export async function etudiReddet(
  okulSlug: string,
  _onceki: OnayDurumu,
  formData: FormData,
): Promise<OnayDurumu> {
  const oturum = await actionYetkisi("admin");

  const etutId = String(formData.get("etutId") ?? "");
  const neden = String(formData.get("neden") ?? "").trim();
  if (!z.string().uuid().safeParse(etutId).success) return { hata: "Etüt bulunamadı." };
  if (neden.length < 3) {
    return { hata: "Red nedeni yazın — öğretmen neyi düzelteceğini bilmeli." };
  }

  const supabase = await supabaseSunucu();
  const { error } = await supabase
    .from("etuts")
    .update({
      durum: "reddedildi",
      red_nedeni: neden,
      approved_by: oturum.kullaniciId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", etutId)
    .eq("durum", "onay_bekliyor");

  if (error) return { hata: `Reddedilemedi: ${error.message}` };

  await denetimYaz({
    schoolId: oturum.schoolId,
    actorUserId: oturum.kullaniciId,
    islem: "etut.reddet",
    entity: "etuts",
    entityId: etutId,
    sonrasi: { red_nedeni: neden },
  });

  revalidatePath(`/${okulSlug}/yonetim/onaylar`);
  return { basari: "Etüt reddedildi, öğretmene not iletildi." };
}
