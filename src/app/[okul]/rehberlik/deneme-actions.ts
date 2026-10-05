"use server";

/**
 * Deneme sınavı işlemleri.
 *
 * `actions.ts`'ten AYRI duruyor ve bu bilinçli: o dosyanın kuralı "yalnızca
 * rehber, yönetici bile göremez" (0023). Deneme verisi öyle değil — akademik
 * bir ölçü, yönetici de öğretmen de görür (0027). İkisini aynı dosyada
 * toplamak, o ayrımı okuyan kişinin gözünde siler.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionYetkisi } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface DenemeSonuc {
  hata?: string;
  basari?: string;
  /** Yeni açılan denemenin kimliği — arayüz onu seçili hâle getirir. */
  examId?: string;
}

function yenile(okulSlug: string) {
  revalidatePath(`/${okulSlug}/rehberlik`);
}

const denemeSemasi = z.object({
  ad: z.string().trim().min(3, "Denemeye bir ad verin.").max(120),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih geçersiz."),
  tur: z.string().trim().max(20).optional(),
});

export async function denemeAc(okulSlug: string, girdi: unknown): Promise<DenemeSonuc> {
  const oturum = await actionYetkisi("rehber", "admin");

  const sonuc = denemeSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("mock_exams")
    .insert({
      school_id: oturum.schoolId,
      ad: sonuc.data.ad,
      tarih: sonuc.data.tarih,
      tur: sonuc.data.tur || null,
      olusturan: oturum.kullaniciId,
    })
    .select("id")
    .single();

  if (error) {
    // (school_id, ad, tarih) benzersiz: aynı deneme iki kez açılırsa
    // sonuçlar ikiye bölünür ve karşılaştırma bozulur.
    if (/duplicate key|unique/i.test(error.message)) {
      return { hata: "Bu ad ve tarihte bir deneme zaten var." };
    }
    return { hata: "Deneme açılamadı." };
  }

  yenile(okulSlug);
  return { basari: "Deneme açıldı.", examId: data.id };
}

const dersSemasi = z.object({
  subjectId: z.string().uuid(),
  dogru: z.coerce.number().int().min(0).max(999),
  yanlis: z.coerce.number().int().min(0).max(999),
  bos: z.coerce.number().int().min(0).max(999),
});

const sonucSemasi = z.object({
  examId: z.string().uuid(),
  ogrenciId: z.string().uuid(),
  puan: z.coerce.number().min(0).max(9999).optional().nullable(),
  siralama: z.coerce.number().int().min(1).max(9_999_999).optional().nullable(),
  dersler: z.array(dersSemasi).min(1, "En az bir dersin sonucunu girin."),
});

/**
 * Bir öğrencinin deneme sonucunu kaydeder; varsa üzerine yazar.
 *
 * Ders satırları önce SİLİNİP yeniden yazılıyor. `upsert` ile de olurdu ama o
 * zaman bir düzeltmede kaldırılan ders (ör. yanlışlıkla girilmiş "Fizik")
 * satırda kalırdı ve toplam net yanlış çıkardı. "Ne girildiyse o" davranışı
 * düzeltmeyi öngörülebilir kılıyor.
 */
export async function sonucKaydet(okulSlug: string, girdi: unknown): Promise<DenemeSonuc> {
  const oturum = await actionYetkisi("rehber", "admin");

  const sonuc = sonucSemasi.safeParse(girdi);
  if (!sonuc.success) return { hata: sonuc.error.issues[0].message };
  const g = sonuc.data;

  const supabase = await supabaseSunucu();

  const { data: satir, error: satirHatasi } = await supabase
    .from("mock_exam_results")
    .upsert(
      {
        school_id: oturum.schoolId,
        exam_id: g.examId,
        student_id: g.ogrenciId,
        puan: g.puan ?? null,
        siralama: g.siralama ?? null,
      },
      { onConflict: "exam_id,student_id" },
    )
    .select("id")
    .single();

  if (satirHatasi || !satir) {
    if (satirHatasi && /row-level security/i.test(satirHatasi.message)) {
      return { hata: "Bu öğrenciye sonuç girme yetkiniz yok." };
    }
    return { hata: "Sonuç kaydedilemedi." };
  }

  await supabase.from("mock_exam_subject_results").delete().eq("result_id", satir.id);

  const { error } = await supabase.from("mock_exam_subject_results").insert(
    g.dersler.map((d) => ({
      school_id: oturum.schoolId,
      result_id: satir.id,
      student_id: g.ogrenciId,
      subject_id: d.subjectId,
      dogru: d.dogru,
      yanlis: d.yanlis,
      bos: d.bos,
    })),
  );

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { hata: "Aynı dersi iki kez girdiniz." };
    }
    return { hata: "Ders sonuçları kaydedilemedi." };
  }

  yenile(okulSlug);
  return { basari: "Sonuç kaydedildi." };
}

export async function sonucSil(
  okulSlug: string,
  examId: string,
  ogrenciId: string,
): Promise<DenemeSonuc> {
  await actionYetkisi("rehber", "admin");
  if (!z.string().uuid().safeParse(examId).success) return { hata: "Deneme bulunamadı." };
  if (!z.string().uuid().safeParse(ogrenciId).success) return { hata: "Öğrenci bulunamadı." };

  const supabase = await supabaseSunucu();
  // Ders satırları `on delete cascade` ile birlikte gider.
  const { error } = await supabase
    .from("mock_exam_results")
    .delete()
    .eq("exam_id", examId)
    .eq("student_id", ogrenciId);

  if (error) return { hata: "Sonuç silinemedi." };

  yenile(okulSlug);
  return { basari: "Sonuç silindi." };
}

/**
 * Excel'den kopyalanan satırları toplu kaydeder.
 *
 * NEDEN ŞABLON YÜKLEME HATTI DEĞİL: mevcut içe aktarım hattı (veri-aktarimi)
 * yükleme başına parametre almıyor — "bu satırlar hangi denemeye ait?"
 * sorusunu soracağı bir yer yok ve şablona sınav adı/tarihi sütunu koymak
 * okulun her satıra aynı şeyi yazmasını gerektirirdi. Burada sınav zaten
 * ekranda seçili; rehber Excel'den hücreleri kopyalayıp yapıştırıyor.
 *
 * Beklenen biçim (sekmeyle ayrılmış, Excel'den kopyalayınca böyle gelir):
 *     okul_no  ders  dogru  yanlis  bos
 *
 * Satırların HİÇBİRİ yazılmadan önce tamamı çözümleniyor: yarısı yazılıp
 * yarısı hata veren bir yükleme, rehberin neyi düzelteceğini bilemediği bir
 * durum bırakırdı.
 */
export interface TopluSonuc extends DenemeSonuc {
  /** Satır satır sorunlar; doluysa hiçbir şey yazılmamıştır. */
  sorunlar?: string[];
  yazilan?: number;
}

export async function topluSonucKaydet(
  okulSlug: string,
  examId: string,
  metin: string,
): Promise<TopluSonuc> {
  // Yetki burada da doğrulanıyor; asıl yazma `sonucKaydet` üzerinden gidiyor.
  await actionYetkisi("rehber", "admin");
  if (!z.string().uuid().safeParse(examId).success) return { hata: "Deneme bulunamadı." };

  const satirlar = metin
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!satirlar.length) return { hata: "Yapıştırılan alan boş." };
  if (satirlar.length > 2000) return { hata: "Tek seferde en fazla 2000 satır." };

  const supabase = await supabaseSunucu();
  const [{ data: ogrenciler }, { data: dersler }] = await Promise.all([
    supabase.from("v_ogrenci_dizini").select("id, okul_no"),
    supabase.from("subjects").select("id, ad").eq("aktif", true),
  ]);

  const noyaGore = new Map((ogrenciler ?? []).map((o) => [String(o.okul_no).trim(), o.id]));
  const derseGore = new Map(
    (dersler ?? []).map((d) => [d.ad.trim().toLocaleLowerCase("tr-TR"), d.id]),
  );

  const sorunlar: string[] = [];
  // ogrenciId → (subjectId → sayılar)
  const toplanan = new Map<string, Map<string, { dogru: number; yanlis: number; bos: number }>>();

  satirlar.forEach((satir, i) => {
    const no = i + 1;
    const p = satir.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (p.length < 4) {
      sorunlar.push(`${no}. satır: en az okul no, ders, doğru, yanlış gerekiyor.`);
      return;
    }

    const ogrenciId = noyaGore.get(p[0]);
    if (!ogrenciId) {
      sorunlar.push(`${no}. satır: "${p[0]}" numaralı öğrenci bulunamadı.`);
      return;
    }
    const subjectId = derseGore.get(p[1].toLocaleLowerCase("tr-TR"));
    if (!subjectId) {
      sorunlar.push(`${no}. satır: "${p[1]}" dersi tanımlı değil.`);
      return;
    }

    const sayi = (deger: string | undefined, ad: string): number | null => {
      if (deger === undefined || deger === "") return 0;
      const n = Number(deger.replace(",", "."));
      if (!Number.isInteger(n) || n < 0 || n > 999) {
        sorunlar.push(`${no}. satır: ${ad} değeri geçersiz ("${deger}").`);
        return null;
      }
      return n;
    };

    const dogru = sayi(p[2], "doğru");
    const yanlis = sayi(p[3], "yanlış");
    const bos = sayi(p[4], "boş");
    if (dogru === null || yanlis === null || bos === null) return;

    const dersHaritasi = toplanan.get(ogrenciId) ?? new Map();
    // Aynı öğrenci-ders ikilisi iki kez gelirse sonuncusu geçerli: rehber
    // düzeltme satırını altına ekliyor olabilir.
    dersHaritasi.set(subjectId, { dogru, yanlis, bos });
    toplanan.set(ogrenciId, dersHaritasi);
  });

  if (sorunlar.length) {
    return { hata: `${sorunlar.length} satır işlenemedi; hiçbiri kaydedilmedi.`, sorunlar };
  }

  let yazilan = 0;
  for (const [ogrenciId, dersHaritasi] of toplanan) {
    const sonuc = await sonucKaydet(okulSlug, {
      examId,
      ogrenciId,
      puan: null,
      siralama: null,
      dersler: [...dersHaritasi.entries()].map(([subjectId, d]) => ({ subjectId, ...d })),
    });
    if (sonuc.hata) {
      return {
        hata: `${yazilan} öğrenci kaydedildi, sonra durdu: ${sonuc.hata}`,
        yazilan,
      };
    }
    yazilan++;
  }

  yenile(okulSlug);
  return { basari: `${yazilan} öğrencinin sonucu kaydedildi.`, yazilan };
}
