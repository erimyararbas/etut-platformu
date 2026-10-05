"use server";

/**
 * Excel yükleme işlemleri.
 *
 * İKİ AŞAMA, TEK KAYNAK: önce `onizle` dosyayı ayrıştırıp sonucu gösterir ve
 * veritabanına HİÇBİR ŞEY yazmaz; yönetici onaylayınca `uygulaDosya` aynı
 * dosyayı baştan ayrıştırıp uygular.
 *
 * Dosya iki kez ayrıştırılıyor çünkü sunucuda aşama arası durum tutulmuyor —
 * dosya zaten tarayıcıda duruyor, ikinci kez göndermek bedava. Bunun bir yan
 * faydası da var: uygulama anında çapraz referanslar yeniden okunuyor, yani
 * önizleme ile uygulama arasında başka bir yönetici veri yüklediyse sonuç
 * yine tutarlı oluyor.
 */

import { revalidatePath } from "next/cache";
import { actionYetkisi } from "@/lib/auth/oturum";
import { servisIstemcisi, servisBaglantisi } from "@/lib/supabase/service";
import { supabaseAuthSaglayici } from "@/lib/import/auth-saglayici";
import { parseTemplate, type SatirNotu } from "@/lib/import/parse";
import { uygula, lookupsGetir, type DavetKaydi } from "@/lib/import/apply";
import { TEMPLATES_BY_ID, type TemplateId } from "@/lib/import/templates";

/** En fazla kaç örnek satır gösterilecek (tarayıcıya giden veriyi sınırlar). */
const ORNEK_SATIR = 8;
const EN_FAZLA_HATA = 50;
/** 5 MB — 10.000 satırlık bir öğrenci dosyası bunun çok altında kalır. */
const EN_BUYUK_DOSYA = 5 * 1024 * 1024;

export interface HataliSatir {
  satirNo: number;
  ozet: string;
  hatalar: SatirNotu[];
}

export interface OnizlemeSonucu {
  durum: "onizleme" | "uygulandi" | "hata";
  templateId: TemplateId;
  dosyaAdi: string;
  dosyaHatalari: string[];
  dosyaUyarilari: string[];
  ozet: { toplam: number; ekle: number; guncelle: number; hata: number; uyari: number };
  hataliSatirlar: HataliSatir[];
  /** Kesilen hata sayısı (listede gösterilmeyenler). */
  gizlenenHata: number;
  ornekSatirlar: { satirNo: number; islem: string; degerler: string[] }[];
  basliklar: string[];
  davetKodlari?: DavetKaydi[];
}

function bosSonuc(templateId: TemplateId, dosyaAdi: string, hata: string): OnizlemeSonucu {
  return {
    durum: "hata",
    templateId,
    dosyaAdi,
    dosyaHatalari: [hata],
    dosyaUyarilari: [],
    ozet: { toplam: 0, ekle: 0, guncelle: 0, hata: 0, uyari: 0 },
    hataliSatirlar: [],
    gizlenenHata: 0,
    ornekSatirlar: [],
    basliklar: [],
  };
}

async function dosyayiAl(formData: FormData): Promise<{ dosya: File } | { hata: string }> {
  const dosya = formData.get("dosya");
  if (!(dosya instanceof File) || dosya.size === 0) {
    return { hata: "Dosya seçilmedi." };
  }
  if (dosya.size > EN_BUYUK_DOSYA) {
    return {
      hata: `Dosya çok büyük (${(dosya.size / 1024 / 1024).toFixed(1)} MB). En fazla 5 MB olabilir.`,
    };
  }
  if (!dosya.name.toLowerCase().endsWith(".xlsx")) {
    return { hata: "Yalnızca .xlsx dosyası yükleyebilirsiniz (.xls ve .csv desteklenmez)." };
  }
  return { dosya };
}

function sonucaCevir(
  templateId: TemplateId,
  dosyaAdi: string,
  ayristirma: Awaited<ReturnType<typeof parseTemplate>>,
): OnizlemeSonucu {
  const def = TEMPLATES_BY_ID[templateId];
  const hatalilar = ayristirma.satirlar.filter((s) => s.islem === "hata");

  return {
    durum: "onizleme",
    templateId,
    dosyaAdi,
    dosyaHatalari: ayristirma.dosyaHatalari,
    dosyaUyarilari: ayristirma.dosyaUyarilari,
    ozet: ayristirma.ozet,
    hataliSatirlar: hatalilar.slice(0, EN_FAZLA_HATA).map((s) => ({
      satirNo: s.satirNo,
      // Satırı tanıtacak kadar bilgi: benzersizlik sütunlarının ham hâli.
      ozet: def.uniqueKey.map((k) => s.ham[k]).filter(Boolean).join(" · ") || "(boş satır)",
      hatalar: s.hatalar,
    })),
    gizlenenHata: Math.max(0, hatalilar.length - EN_FAZLA_HATA),
    ornekSatirlar: ayristirma.satirlar
      .filter((s) => s.islem !== "hata")
      .slice(0, ORNEK_SATIR)
      .map((s) => ({
        satirNo: s.satirNo,
        islem: s.islem,
        degerler: def.columns.map((c) => s.ham[c.key] ?? ""),
      })),
    basliklar: def.columns.map((c) => c.header),
  };
}

export async function onizle(
  templateId: TemplateId,
  _oncekiDurum: OnizlemeSonucu | null,
  formData: FormData,
): Promise<OnizlemeSonucu> {
  const oturum = await actionYetkisi("admin");

  const alinan = await dosyayiAl(formData);
  if ("hata" in alinan) return bosSonuc(templateId, "", alinan.hata);

  const { db, kapat } = await servisBaglantisi();
  try {
    const lookups = await lookupsGetir(db, oturum.schoolId, templateId);
    const ayristirma = await parseTemplate(
      await alinan.dosya.arrayBuffer(),
      templateId,
      lookups,
    );
    return sonucaCevir(templateId, alinan.dosya.name, ayristirma);
  } finally {
    await kapat();
  }
}

export async function uygulaDosya(
  templateId: TemplateId,
  okulSlug: string,
  _oncekiDurum: OnizlemeSonucu | null,
  formData: FormData,
): Promise<OnizlemeSonucu> {
  const oturum = await actionYetkisi("admin");

  const alinan = await dosyayiAl(formData);
  if ("hata" in alinan) return bosSonuc(templateId, "", alinan.hata);

  const { db, kapat } = await servisBaglantisi();
  try {
    const lookups = await lookupsGetir(db, oturum.schoolId, templateId);
    const ayristirma = await parseTemplate(
      await alinan.dosya.arrayBuffer(),
      templateId,
      lookups,
    );

    const sonuc = sonucaCevir(templateId, alinan.dosya.name, ayristirma);

    if (ayristirma.dosyaHatalari.length) {
      return { ...sonuc, durum: "hata" };
    }
    if (ayristirma.ozet.toplam === 0) {
      return { ...sonuc, durum: "hata", dosyaHatalari: ["Dosyada uygulanacak satır yok."] };
    }

    const uygulama = await uygula(db, {
      schoolId: oturum.schoolId,
      templateId,
      satirlar: ayristirma.satirlar,
      yukleyenId: oturum.kullaniciId,
      dosyaAdi: alinan.dosya.name,
      authSaglayici: supabaseAuthSaglayici(servisIstemcisi(), db),
    });

    revalidatePath(`/${okulSlug}/yonetim/veri-aktarimi`);

    return {
      ...sonuc,
      durum: "uygulandi",
      ozet: {
        ...sonuc.ozet,
        ekle: uygulama.eklendi,
        guncelle: uygulama.guncellendi,
      },
      davetKodlari: uygulama.davetKodlari,
    };
  } catch (err) {
    return {
      ...bosSonuc(templateId, alinan.dosya.name, (err as Error).message),
    };
  } finally {
    await kapat();
  }
}

/** Yükleme ekranında her şablonun yanında gösterilen mevcut kayıt sayısı. */
export async function mevcutSayilar(): Promise<Record<TemplateId, number>> {
  const oturum = await actionYetkisi("admin");
  const servis = servisIstemcisi();

  const tablolar: Record<TemplateId, string> = {
    siniflar: "classes",
    dersler: "subjects",
    konular: "topics",
    derslikler: "rooms",
    etut_turleri: "etut_types",
    ogretmenler: "teachers",
    ogrenciler: "students",
    veliler: "parent_students",
  };

  const sonuc = {} as Record<TemplateId, number>;
  await Promise.all(
    Object.entries(tablolar).map(async ([id, tablo]) => {
      const { count } = await servis
        .from(tablo)
        .select("*", { count: "exact", head: true })
        .eq("school_id", oturum.schoolId);
      sonuc[id as TemplateId] = count ?? 0;
    }),
  );
  return sonuc;
}
