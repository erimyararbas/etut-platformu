"use server";

/**
 * Rehberin etüt açması ve öğrenci talebini karara bağlaması.
 *
 * Etüt rehberin OTURUMUYLA yazılıyor, yani RLS devrede
 * (`etuts_rehber_olusturur`, 0029): `created_by = auth.uid()` şartı var,
 * dolayısıyla rehber formu ne kadar kurcalarsa kurcalasın etüdü başkası
 * açmış gibi kaydedemez. Buradaki kontroller kullanıcıya anlamlı hata vermek
 * için.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { araligiDogrula, birebirMi } from "@/lib/etut/kurallar";

export interface RehberEtutSonuc {
  hata?: string;
  basari?: string;
  etutId?: string;
}

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/rehberlik`);
  revalidatePath(`/${okulSlug}/ogretmen`);
  revalidatePath(`/${okulSlug}/ogrenci`);
}

const semasi = z.object({
  ogretmenId: z.string().uuid("Öğretmen seçin."),
  dersId: z.string().uuid("Ders seçin."),
  konuId: z.string().uuid().or(z.literal("")).optional(),
  turId: z.string().uuid("Etüt türü seçin."),
  derslikId: z.string().uuid().or(z.literal("")).optional(),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçin."),
  baslangic: z.string().min(1, "Başlangıç saatini seçin."),
  bitis: z.string().min(1, "Bitiş saatini seçin."),
  kontenjan: z.coerce.number().int().min(1).max(500),
  aciklama: z.string().max(1000).optional(),
  ogrenciIdler: z.array(z.string().uuid()).min(1, "En az bir öğrenci seçin."),
  /** Bu etüt bir talebi karşılıyorsa talebin kimliği. */
  talepId: z.string().uuid().or(z.literal("")).optional(),
});

export async function rehberEtutAc(
  okulSlug: string,
  girdi: unknown,
): Promise<RehberEtutSonuc> {
  const oturum = await actionYetkisi("rehber");

  const sonuc = semasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const g = sonuc.data;

  const aralik = araligiDogrula(g.baslangic, g.bitis);
  if ("hata" in aralik) return { hata: aralik.hata };

  const supabase = await supabaseSunucu();

  const [{ data: tur }, { data: ayar }, { data: derslik }] = await Promise.all([
    supabase.from("etut_types").select("ad").eq("id", g.turId).maybeSingle(),
    supabase
      .from("school_settings")
      .select("rehber_etut_ogretmen_onayi")
      .eq("school_id", oturum.schoolId)
      .maybeSingle(),
    g.derslikId
      ? supabase.from("rooms").select("kod, kapasite").eq("id", g.derslikId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!tur) return { hata: "Etüt türü bulunamadı." };

  // Birebir etüdün kontenjanı 1; öğretmen formundaki kuralın aynısı.
  const birebir = birebirMi(tur.ad);
  const kontenjan = birebir ? 1 : g.kontenjan;

  if (birebir && g.ogrenciIdler.length > 1) {
    return { hata: "Birebir etüde yalnızca bir öğrenci atanabilir." };
  }
  if (g.ogrenciIdler.length > kontenjan) {
    return {
      hata: `${g.ogrenciIdler.length} öğrenci seçtiniz ama kontenjan ${kontenjan}.`,
    };
  }
  if (derslik && kontenjan > derslik.kapasite) {
    return {
      hata: `Kontenjan (${kontenjan}) ${derslik.kod} dersliğinin kapasitesini (${derslik.kapasite}) aşıyor.`,
    };
  }

  // Ayar açıkken etüt öğretmenin onayını bekler. Yeni bir durum eklenmedi:
  // onaylayanın kim olduğunu `created_by` belirliyor (bkz. 0029).
  const durum = ayar?.rehber_etut_ogretmen_onayi === false ? "onaylandi" : "onay_bekliyor";

  const { data: etut, error } = await supabase
    .from("etuts")
    .insert({
      school_id: oturum.schoolId,
      teacher_id: g.ogretmenId,
      subject_id: g.dersId,
      topic_id: g.konuId || null,
      etut_type_id: g.turId,
      room_id: g.derslikId || null,
      tarih: g.tarih,
      baslangic: g.baslangic,
      bitis: g.bitis,
      kontenjan,
      aciklama: g.aciklama || null,
      sinif_etudu_mu: false,
      durum,
      created_by: oturum.kullaniciId,
    })
    .select("id")
    .single();

  if (error || !etut) {
    if (error?.message.includes("etuts_ogretmen_cakismasi")) {
      return { hata: "Seçtiğiniz öğretmenin o saatte başka bir etüdü var." };
    }
    if (error?.message.includes("etuts_derslik_cakismasi")) {
      return { hata: "Seçtiğiniz derslik o saatte başka bir etüde ayrılmış." };
    }
    if (error && /row-level security/i.test(error.message)) {
      return { hata: "Etüt açma yetkiniz yok." };
    }
    return { hata: `Etüt açılamadı: ${error?.message ?? "bilinmeyen hata"}` };
  }

  // Öğrenciler atanıyor. Bireysel etütte `etut_eligible_classes` YOK; etüdün
  // öğrenciye görünmesini sağlayan şey bu atama (0029'daki ikinci dal).
  const { error: atamaHatasi } = await supabase.rpc("etude_ogrenci_ata", {
    p_etut_id: etut.id,
    p_student_ids: g.ogrenciIdler,
  });

  if (atamaHatasi) {
    return { hata: `Etüt açıldı ama öğrenciler atanamadı: ${atamaHatasi.message}` };
  }

  if (g.talepId) {
    await supabase
      .from("etut_requests")
      .update({
        durum: "karsilandi",
        karar_veren: oturum.kullaniciId,
        etut_id: etut.id,
      })
      .eq("id", g.talepId)
      .eq("durum", "bekliyor");
  }

  yenile(okulSlug);
  return {
    basari:
      durum === "onaylandi"
        ? `Etüt açıldı ve ${g.ogrenciIdler.length} öğrenci atandı.`
        : `Etüt açıldı, öğretmenin onayı bekleniyor. ${g.ogrenciIdler.length} öğrenci atandı.`,
    etutId: etut.id,
  };
}

export async function talebiReddet(
  okulSlug: string,
  talepId: string,
  neden: string,
): Promise<RehberEtutSonuc> {
  const oturum = await actionYetkisi("rehber");
  if (!z.string().uuid().safeParse(talepId).success) return { hata: "Talep bulunamadı." };

  const temiz = neden.trim();
  if (temiz.length < 3) {
    return { hata: "Kısa bir gerekçe yazın — öğrenci neden karşılanmadığını görmeli." };
  }

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etut_requests")
    .update({
      durum: "reddedildi",
      karar_veren: oturum.kullaniciId,
      karar_notu: temiz.slice(0, 500),
    })
    .eq("id", talepId)
    .eq("durum", "bekliyor")
    .select("id");

  if (error) return { hata: "Talep güncellenemedi." };
  if (!data?.length) return { hata: "Bu talep zaten karara bağlanmış." };

  yenile(okulSlug);
  return { basari: "Talep karşılanamadı olarak kapatıldı." };
}

/** Öğrenci etüt talebi açar. */
export async function etutTalepEt(
  okulSlug: string,
  girdi: unknown,
): Promise<RehberEtutSonuc> {
  const oturum = await actionYetkisi("ogrenci");

  const sema = z.object({
    dersId: z.string().uuid("Ders seçin."),
    konuId: z.string().uuid().or(z.literal("")).optional(),
    neden: z.string().trim().min(10, "Neye ihtiyacın olduğunu kısaca yaz.").max(500),
  });

  const sonuc = sema.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();

  // Aynı ders için bekleyen talebi olan öğrenci ikincisini açamaz: kuyruk
  // aynı isteğin kopyalarıyla dolmasın.
  const { count } = await supabase
    .from("etut_requests")
    .select("id", { count: "exact", head: true })
    .eq("student_id", oturum.kullaniciId)
    .eq("subject_id", sonuc.data.dersId)
    .eq("durum", "bekliyor");

  if ((count ?? 0) > 0) {
    return { hata: "Bu ders için bekleyen bir talebin zaten var." };
  }

  const { error } = await supabase.from("etut_requests").insert({
    school_id: oturum.schoolId,
    student_id: oturum.kullaniciId,
    subject_id: sonuc.data.dersId,
    topic_id: sonuc.data.konuId || null,
    neden: sonuc.data.neden,
  });

  if (error) return { hata: "Talep gönderilemedi." };

  revalidatePath(`/${okulSlug}/ogrenci`);
  revalidatePath(`/${okulSlug}/rehberlik`);
  return { basari: "Talebin rehberlik servisine iletildi." };
}
