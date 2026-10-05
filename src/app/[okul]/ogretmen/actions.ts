"use server";

/**
 * Öğretmen işlemleri.
 *
 * Her action kendi yetkisini doğrular — Server Action'lar arayüzden geçmeden
 * doğrudan POST ile de çağrılabilir.
 *
 * Etüdün kendisi kullanıcının oturumuyla yazılır, yani RLS devrededir:
 * `etuts_ogretmen_olusturur` politikası `teacher_id = auth.uid()` şartı koyar.
 * Yani bir öğretmen, formu ne kadar kurcalarsa kurcalasın, başkasının adına
 * etüt açamaz. Buradaki kontroller kullanıcıya anlamlı hata vermek içindir.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseSunucu } from "@/lib/supabase/server";
import { actionYetkisi } from "@/lib/auth/oturum";
import {
  araligiDogrula,
  haftalikTarihler,
  kontenjanHesapla,
  birebirSinifEtuduCakismasi,
} from "@/lib/etut/kurallar";
import { formSecenekleri } from "@/lib/etut/sorgular";

export interface EtutActionDurumu {
  hata?: string;
  basari?: string;
  /** Oluşturulan etüt sayısı (haftalık tekrarda birden çok olur). */
  olusan?: number;
}

const semasi = z.object({
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçin."),
  baslangic: z.string().min(1, "Başlangıç saatini seçin."),
  bitis: z.string().min(1, "Bitiş saatini seçin."),
  turId: z.string().uuid("Etüt türü seçin."),
  konuId: z.string().uuid().optional().or(z.literal("")),
  derslikId: z.string().uuid().optional().or(z.literal("")),
  kontenjan: z.coerce.number().int().min(1, "Kontenjan en az 1 olmalı.").max(500),
  aciklama: z.string().max(1000).optional(),
  sinifEtudu: z.coerce.boolean().optional(),
  periyot: z.enum(["tek_seferlik", "haftalik"]),
  haftaSayisi: z.coerce.number().int().min(1).max(12).optional(),
});

export async function etutOlustur(
  okulSlug: string,
  _onceki: EtutActionDurumu,
  formData: FormData,
): Promise<EtutActionDurumu> {
  const oturum = await actionYetkisi("ogretmen");

  const girdi = semasi.safeParse({
    tarih: formData.get("tarih"),
    baslangic: formData.get("baslangic"),
    bitis: formData.get("bitis"),
    turId: formData.get("turId"),
    konuId: formData.get("konuId") ?? "",
    derslikId: formData.get("derslikId") ?? "",
    kontenjan: formData.get("kontenjan"),
    aciklama: formData.get("aciklama") ?? "",
    sinifEtudu: formData.get("sinifEtudu") === "on",
    periyot: formData.get("periyot"),
    haftaSayisi: formData.get("haftaSayisi") ?? 4,
  });
  if (!girdi.success) return { hata: girdi.error.issues[0].message };
  const g = girdi.data;

  const aralik = araligiDogrula(g.baslangic, g.bitis);
  if ("hata" in aralik) return { hata: aralik.hata };

  const siniflar = formData.getAll("siniflar").map(String).filter(Boolean);
  if (!siniflar.length) {
    return { hata: "En az bir sınıf seçin — etüdü kimlerin görebileceği buradan belirlenir." };
  }

  const secenekler = await formSecenekleri(oturum.kullaniciId);
  if (!secenekler) return { hata: "Öğretmen kaydınız bulunamadı." };

  // Öğretmenin verebileceği tür listesi kısıtlıysa dışına çıkılamaz.
  const secilenTur = secenekler.turler.find((t) => t.id === g.turId);
  if (!secilenTur) {
    return { hata: "Bu etüt türünü veremezsiniz." };
  }
  const secilenSiniflar = secenekler.siniflar.filter((s) => siniflar.includes(s.id));
  if (secilenSiniflar.length !== siniflar.length) {
    return { hata: "Seçilen sınıflardan biri bulunamadı." };
  }

  const cakisma = birebirSinifEtuduCakismasi(secilenTur.ad, !!g.sinifEtudu);
  if (cakisma) return { hata: cakisma };

  // Tür adı da buraya geçiyor: birebir etüdün kontenjanı 1'e sabitlenir.
  // İstemci de aynı hesabı yapıp alanı kilitliyor ama ona güvenilmez.
  const kontenjan = kontenjanHesapla(
    !!g.sinifEtudu,
    g.kontenjan,
    secilenSiniflar.reduce((t, s) => t + s.mevcut, 0),
    secilenTur.ad,
  );

  const derslik = secenekler.derslikler.find((d) => d.id === g.derslikId);
  if (g.derslikId && !derslik) return { hata: "Seçilen derslik bulunamadı." };
  if (derslik && kontenjan > derslik.kapasite) {
    return {
      hata: `Kontenjan (${kontenjan}) ${derslik.kod} dersliğinin kapasitesini (${derslik.kapasite}) aşıyor.`,
    };
  }

  const tarihler =
    g.periyot === "haftalik"
      ? haftalikTarihler(
          g.tarih,
          formData.getAll("gunler").map(Number).filter(Boolean),
          g.haftaSayisi ?? 4,
        )
      : [g.tarih];

  if (!tarihler.length) {
    return { hata: "Haftalık tekrar için en az bir gün seçin." };
  }

  const supabase = await supabaseSunucu();

  // Okul ayarı: etüt yayına girmeden önce yönetici onayı gerekiyor mu?
  const { data: ayar } = await supabase
    .from("school_settings")
    .select("etut_onay_gerekli")
    .eq("school_id", oturum.schoolId)
    .maybeSingle();
  const durum = ayar?.etut_onay_gerekli === false ? "onaylandi" : "onay_bekliyor";

  let recurrenceId: string | null = null;
  if (g.periyot === "haftalik") {
    const { data: seri } = await supabase
      .from("etut_recurrences")
      .insert({
        school_id: oturum.schoolId,
        kural: {
          gunler: formData.getAll("gunler").map(Number),
          hafta_sayisi: g.haftaSayisi ?? 4,
        },
        created_by: oturum.kullaniciId,
      })
      .select("id")
      .single();
    recurrenceId = seri?.id ?? null;
  }

  const { data: olusan, error } = await supabase
    .from("etuts")
    .insert(
      tarihler.map((tarih) => ({
        school_id: oturum.schoolId,
        teacher_id: oturum.kullaniciId,
        subject_id: secenekler.bransId,
        topic_id: g.konuId || null,
        etut_type_id: g.turId,
        room_id: g.derslikId || null,
        tarih,
        baslangic: g.baslangic,
        bitis: g.bitis,
        kontenjan,
        aciklama: g.aciklama || null,
        sinif_etudu_mu: !!g.sinifEtudu,
        durum,
        periyot: g.periyot,
        recurrence_id: recurrenceId,
        created_by: oturum.kullaniciId,
      })),
    )
    .select("id");

  if (error) return { hata: cakismaMesaji(error.message) };
  if (!olusan?.length) return { hata: "Etüt oluşturulamadı." };

  // Uygun sınıflar
  await supabase.from("etut_eligible_classes").insert(
    olusan.flatMap((e) => siniflar.map((class_id) => ({ etut_id: e.id, class_id }))),
  );

  // Sınıf etüdünde öğrenciler otomatik atanır ve kontenjan mevcuda eşitlenir.
  if (g.sinifEtudu) {
    for (const e of olusan) {
      await supabase.rpc("sinif_etudu_ogrencileri_ata", { p_etut_id: e.id });
    }
  }

  revalidatePath(`/${okulSlug}/ogretmen`);
  revalidatePath(`/${okulSlug}/yonetim/onaylar`);

  const onayli = durum === "onaylandi";
  return {
    olusan: olusan.length,
    basari:
      olusan.length === 1
        ? onayli
          ? "Etüt oluşturuldu ve yayına alındı."
          : "Etüt oluşturuldu, yönetici onayı bekliyor."
        : onayli
          ? `${olusan.length} etüt oluşturuldu ve yayına alındı.`
          : `${olusan.length} etüt oluşturuldu, yönetici onayı bekliyor.`,
  };
}

/**
 * Veritabanı kısıtlarının teknik mesajını kullanıcıya anlamlı hâle getirir.
 * Çakışmalar exclusion constraint ile engellendiği için buraya düşerler.
 */
function cakismaMesaji(mesaj: string): string {
  if (mesaj.includes("etuts_ogretmen_cakismasi")) {
    return "Bu saat aralığında zaten bir etüdünüz var.";
  }
  if (mesaj.includes("etuts_derslik_cakismasi")) {
    return "Seçtiğiniz derslik o saatte başka bir etüde ayrılmış.";
  }
  if (mesaj.includes("derslik kapasitesini")) return mesaj;
  return `Etüt oluşturulamadı: ${mesaj}`;
}

/** Öğretmen kendi etüdünü iptal eder. */
export async function etutIptalEt(
  okulSlug: string,
  etutId: string,
): Promise<EtutActionDurumu> {
  const oturum = await actionYetkisi("ogretmen");
  const supabase = await supabaseSunucu();

  // RLS zaten başkasının etüdünü güncellemeye izin vermez; eq() yalnızca
  // hata mesajını netleştirmek için.
  const { error } = await supabase
    .from("etuts")
    .update({ durum: "iptal" })
    .eq("id", etutId)
    .eq("teacher_id", oturum.kullaniciId);

  if (error) return { hata: `İptal edilemedi: ${error.message}` };
  revalidatePath(`/${okulSlug}/ogretmen`);
  return { basari: "Etüt iptal edildi." };
}

/**
 * Rehberin öğretmen adına açtığı etüdü öğretmen karara bağlar (0029).
 *
 * `etuts_ogretmen_gunceller` politikası `teacher_id = auth.uid()` şartı
 * koyuyor, yani öğretmen yalnızca KENDİ adına açılmış etüdü onaylayabilir.
 * `.eq("durum", "onay_bekliyor")` idempotent yapıyor: iki kez tıklamak ikinci
 * kez bir şey değiştirmez.
 */
export async function rehberEtudunuKararaBagla(
  okulSlug: string,
  etutId: string,
  onay: boolean,
  neden?: string,
): Promise<EtutActionDurumu> {
  const oturum = await actionYetkisi("ogretmen");
  if (!z.string().uuid().safeParse(etutId).success) return { hata: "Etüt bulunamadı." };
  if (!onay && (neden ?? "").trim().length < 3) {
    return { hata: "Kısa bir gerekçe yazın — etüdü açan kişi nedenini görmeli." };
  }

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etuts")
    .update(
      onay
        ? {
            durum: "onaylandi",
            approved_by: oturum.kullaniciId,
            approved_at: new Date().toISOString(),
            red_nedeni: null,
          }
        : {
            durum: "reddedildi",
            approved_by: oturum.kullaniciId,
            approved_at: new Date().toISOString(),
            red_nedeni: (neden ?? "").trim().slice(0, 500),
          },
    )
    .eq("id", etutId)
    .eq("teacher_id", oturum.kullaniciId)
    .eq("durum", "onay_bekliyor")
    .select("id");

  if (error) return { hata: `İşlenemedi: ${error.message}` };
  if (!data?.length) return { hata: "Bu etüt zaten karara bağlanmış." };

  revalidatePath(`/${okulSlug}/ogretmen`);
  revalidatePath(`/${okulSlug}/rehberlik`);
  return {
    basari: onay
      ? "Etüt onaylandı ve öğrencilere açıldı."
      : "Etüt reddedildi, açan kişiye gerekçe iletildi.",
  };
}
