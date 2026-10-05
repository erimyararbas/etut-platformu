/**
 * Etüt ekranlarının okuma katmanı.
 *
 * Tüm sorgular kullanıcının kendi oturumuyla (anon anahtar + JWT) yapılır, yani
 * RLS DEVREDEDİR. Öğretmen başkasının etüdünü, öğrenci sınıfına açık olmayan
 * etüdü buradan çekemez — kısıt uygulamada değil, veritabanında.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";

export interface EtutOzeti {
  id: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  kontenjan: number;
  durum: string;
  aciklama: string | null;
  sinifEtuduMu: boolean;
  redNedeni: string | null;
  ders: string;
  konu: string | null;
  tur: string;
  derslik: string | null;
  ogretmen: string;
  /** Kontenjandan yer tutanlar (rezerve + atandı). */
  dolu: number;
  bekleyen: number;
  uygunSiniflar: string[];
}

/**
 * Etüt satırlarını ekranın beklediği biçime çevirir.
 *
 * Rezervasyon sayıları ayrı bir sorguyla toplanır: PostgREST'in gömülü sayımı
 * duruma göre filtrelenemediği için "rezerve" ile "beklemede" ayrımını
 * burada yapıyoruz.
 */
async function etutleriBicimlendir(
  supabase: Awaited<ReturnType<typeof supabaseSunucu>>,
  satirlar: Record<string, unknown>[],
): Promise<EtutOzeti[]> {
  const idler = satirlar.map((s) => s.id as string);
  const sayim = new Map<string, { dolu: number; bekleyen: number }>();
  const adlar = new Map<string, string>();

  if (idler.length) {
    const ogretmenIdleri = [...new Set(satirlar.map((s) => s.teacher_id as string))];
    const { data: ogretmenler } = await supabase
      .from("v_ogretmen_dizini")
      .select("id, ad, soyad")
      .in("id", ogretmenIdleri);
    for (const o of ogretmenler ?? []) adlar.set(o.id, `${o.ad} ${o.soyad}`);
  }

  if (idler.length) {
    const { data: rez } = await supabase
      .from("reservations")
      .select("etut_id, durum")
      .in("etut_id", idler);

    for (const r of rez ?? []) {
      const k = sayim.get(r.etut_id) ?? { dolu: 0, bekleyen: 0 };
      if (r.durum === "rezerve" || r.durum === "atandi") k.dolu++;
      else if (r.durum === "beklemede") k.bekleyen++;
      sayim.set(r.etut_id, k);
    }
  }

  return satirlar.map((s) => {
    const ders = s.subjects as { ad: string } | null;
    const konu = s.topics as { ad: string } | null;
    const tur = s.etut_types as { ad: string } | null;
    const oda = s.rooms as { kod: string } | null;

    const siniflar = (s.etut_eligible_classes ?? []) as { classes: { kod: string } | null }[];
    const k = sayim.get(s.id as string) ?? { dolu: 0, bekleyen: 0 };

    return {
      id: s.id as string,
      tarih: s.tarih as string,
      baslangic: (s.baslangic as string).slice(0, 5),
      bitis: (s.bitis as string).slice(0, 5),
      kontenjan: Number(s.kontenjan),
      durum: s.durum as string,
      aciklama: (s.aciklama as string | null) ?? null,
      sinifEtuduMu: Boolean(s.sinif_etudu_mu),
      redNedeni: (s.red_nedeni as string | null) ?? null,
      ders: ders?.ad ?? "—",
      konu: konu?.ad ?? null,
      tur: tur?.ad ?? "—",
      derslik: oda?.kod ?? null,
      ogretmen: adlar.get(s.teacher_id as string) ?? "—",
      dolu: k.dolu,
      bekleyen: k.bekleyen,
      uygunSiniflar: siniflar.map((c) => c.classes?.kod).filter((v): v is string => !!v),
    };
  });
}

/**
 * DİKKAT — öğretmen adı buradan GÖMÜLEREK alınamaz.
 *
 * `etuts.teacher_id` yabancı anahtarı `teachers(user_id)`'yi gösterir, `users`'ı
 * değil. `users!etuts_teacher_id_fkey` denemesi PostgREST'te 400 döner
 * ("Could not find a relationship between 'etuts' and 'users'"). Ad/soyad,
 * tam da bunun için açılan `v_ogretmen_dizini` görünümünden ayrı çekilir.
 */
const ETUT_ALANLARI = `
  id, teacher_id, tarih, baslangic, bitis, kontenjan, durum, aciklama,
  sinif_etudu_mu, red_nedeni,
  subjects(ad), topics(ad), etut_types(ad), rooms(kod),
  etut_eligible_classes(classes(kod))
`;

/** Bir öğretmenin etütleri, tarihe göre. */
export async function ogretmeninEtutleri(ogretmenId: string): Promise<EtutOzeti[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etuts")
    .select(ETUT_ALANLARI)
    .eq("teacher_id", ogretmenId)
    .order("tarih", { ascending: false })
    .order("baslangic", { ascending: true })
    .limit(200);

  // Hatayı yutmuyoruz: yutulduğunda ekran "kayıt yok" der ve sorun görünmez olur.
  if (error) throw new Error(`Etütler okunamadı: ${error.message}`);

  return etutleriBicimlendir(supabase, (data ?? []) as unknown as Record<string, unknown>[]);
}

/**
 * Öğretmenin ONAYINI bekleyen etütler — yani BAŞKASININ onun adına açtıkları
 * (0029: rehber).
 *
 * Yeni bir durum değeri eklenmedi; onaylayanın kim olduğunu `created_by`
 * belirliyor. Öğretmenin kendi açtığı ve yönetici onayı bekleyen etütler bu
 * listeye GİRMEZ — onları onaylayacak kişi yönetici.
 */
export async function onayimiBekleyenler(ogretmenId: string): Promise<EtutOzeti[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etuts")
    .select(ETUT_ALANLARI)
    .eq("teacher_id", ogretmenId)
    .eq("durum", "onay_bekliyor")
    .neq("created_by", ogretmenId)
    .order("tarih")
    .order("baslangic");

  if (error) throw new Error(`Onayınızı bekleyenler okunamadı: ${error.message}`);

  return etutleriBicimlendir(supabase, (data ?? []) as unknown as Record<string, unknown>[]);
}

/** Yönetici onayı bekleyen etütler. */
export async function onayBekleyenler(schoolId: string): Promise<EtutOzeti[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etuts")
    .select(ETUT_ALANLARI)
    .eq("school_id", schoolId)
    .eq("durum", "onay_bekliyor")
    .order("tarih")
    .order("baslangic");

  if (error) throw new Error(`Onay bekleyenler okunamadı: ${error.message}`);

  return etutleriBicimlendir(supabase, (data ?? []) as unknown as Record<string, unknown>[]);
}

/**
 * Okulun tüm etütleri — yönetim listesi.
 *
 * Süzgeç istemcide uygulanır; bir okulun bir dönemdeki etüt sayısı birkaç yüzü
 * geçmez ve her süzgeç değişiminde sunucuya gitmek gereksiz gecikme olurdu.
 * Sınır 500: bundan fazlası tek ekranda zaten okunmaz, o noktada sayfalama
 * gerekir.
 */
export async function okulunEtutleri(schoolId: string): Promise<EtutOzeti[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("etuts")
    .select(ETUT_ALANLARI)
    .eq("school_id", schoolId)
    .order("tarih", { ascending: false })
    .order("baslangic")
    .limit(500);

  if (error) throw new Error(`Etütler okunamadı: ${error.message}`);

  return etutleriBicimlendir(supabase, (data ?? []) as unknown as Record<string, unknown>[]);
}

export interface FormSecenekleri {
  bransId: string;
  bransAdi: string;
  konular: { id: string; ad: string; seviye: string }[];
  turler: { id: string; ad: string }[];
  derslikler: { id: string; kod: string; kapasite: number }[];
  siniflar: { id: string; kod: string; mevcut: number }[];
}

/**
 * Etüt oluşturma formunun seçenekleri.
 *
 * Öğretmen yalnızca KENDİ BRANŞINDAN etüt açabilir; ders seçimi yoktur.
 * Verebileceği tür listesi boşsa tüm aktif türlere izin verilir.
 */
export async function formSecenekleri(ogretmenId: string): Promise<FormSecenekleri | null> {
  const supabase = await supabaseSunucu();

  const { data: ogretmen } = await supabase
    .from("teachers")
    .select("brans_subject_id, verebilecegi_tur_ids, subjects(ad)")
    .eq("user_id", ogretmenId)
    .maybeSingle();

  if (!ogretmen) return null;
  const brans = ogretmen.subjects as unknown as { ad: string } | null;

  const [konular, turler, derslikler, siniflar, ogrenciler] = await Promise.all([
    supabase
      .from("topics")
      .select("id, ad, grade_levels(ad, sira)")
      .eq("subject_id", ogretmen.brans_subject_id)
      .order("sira"),
    supabase.from("etut_types").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("rooms").select("id, kod, kapasite").eq("aktif", true).order("kod"),
    supabase.from("classes").select("id, kod").order("kod"),
    supabase.from("students").select("class_id"),
  ]);

  const mevcutlar = new Map<string, number>();
  for (const s of ogrenciler.data ?? []) {
    if (!s.class_id) continue;
    mevcutlar.set(s.class_id, (mevcutlar.get(s.class_id) ?? 0) + 1);
  }

  const izinli = (ogretmen.verebilecegi_tur_ids ?? []) as string[];

  return {
    bransId: ogretmen.brans_subject_id,
    bransAdi: brans?.ad ?? "—",
    konular: (konular.data ?? []).map((k) => {
      const seviye = k.grade_levels as unknown as { ad: string } | null;
      return { id: k.id, ad: k.ad, seviye: seviye?.ad ?? "" };
    }),
    // Boş dizi = kısıt yok.
    turler: (turler.data ?? []).filter((t) => !izinli.length || izinli.includes(t.id)),
    derslikler: derslikler.data ?? [],
    siniflar: (siniflar.data ?? []).map((c) => ({
      id: c.id,
      kod: c.kod,
      mevcut: mevcutlar.get(c.id) ?? 0,
    })),
  };
}
