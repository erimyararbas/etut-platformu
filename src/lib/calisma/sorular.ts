/**
 * "Çözemediğim sorular" okuma katmanı.
 *
 * Kimin hangi soruyu göreceğine RLS karar veriyor (0017): öğrenci kendininkini,
 * okulun personeli hepsini. Burada rol ayrımı YOK — aynı fonksiyon hem öğrenci
 * hem öğretmen ekranını besliyor ve iki ekranın farklı kural uygulaması
 * mümkün değil.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import { KOVA } from "./gorsel";
import type { CozulemeyenSoru } from "./sorular-gorunum";

export type { CozulemeyenSoru, Yanit } from "./sorular-gorunum";
export { DURUM_ADI, DURUM_SINIFI, soruSirala } from "./sorular-gorunum";

interface HamSoru {
  id: string;
  student_id: string;
  metin: string;
  gorsel_yolu: string | null;
  durum: CozulemeyenSoru["durum"];
  created_at: string;
  hedef_ogretmen_id: string | null;
  subjects: { ad: string } | null;
  topics: { ad: string } | null;
  question_answers: {
    id: string;
    teacher_id: string;
    metin: string;
    gorsel_yolu: string | null;
    created_at: string;
  }[];
}

/**
 * @param yalnizcaOgrenci verilirse o öğrencinin soruları; verilmezse RLS'in
 * izin verdiği tüm sorular (öğretmen ekranı).
 */
export async function sorular(yalnizcaOgrenci?: string): Promise<CozulemeyenSoru[]> {
  const supabase = await supabaseSunucu();

  let sorgu = supabase
    .from("unsolved_questions")
    .select(
      `id, student_id, metin, gorsel_yolu, durum, created_at, hedef_ogretmen_id,
       subjects(ad), topics(ad),
       question_answers(id, teacher_id, metin, gorsel_yolu, created_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (yalnizcaOgrenci) sorgu = sorgu.eq("student_id", yalnizcaOgrenci);

  const { data, error } = await sorgu;
  if (error) throw new Error(`Sorular okunamadı: ${error.message}`);

  const ham = (data ?? []) as unknown as HamSoru[];

  // Ad çözümlemesi: öğrenci ve öğretmen adları dar dizinlerden gelir; `users`
  // tablosuna erişim bu rollerde yok.
  const ogretmenIdleri = new Set<string>();
  const ogrenciIdleri = new Set<string>();
  for (const s of ham) {
    ogrenciIdleri.add(s.student_id);
    if (s.hedef_ogretmen_id) ogretmenIdleri.add(s.hedef_ogretmen_id);
    for (const y of s.question_answers ?? []) ogretmenIdleri.add(y.teacher_id);
  }

  const ogretmenAdi = new Map<string, string>();
  const ogrenciAdi = new Map<string, { ad: string; sinif: string | null }>();

  await Promise.all([
    (async () => {
      if (!ogretmenIdleri.size) return;
      const { data } = await supabase
        .from("v_ogretmen_dizini")
        .select("id, ad, soyad")
        .in("id", [...ogretmenIdleri]);
      for (const o of data ?? []) ogretmenAdi.set(o.id, `${o.ad} ${o.soyad}`);
    })(),
    (async () => {
      if (!ogrenciIdleri.size) return;
      // Öğrenci dizini yalnızca personele açık; öğrenci kendi ekranında bu
      // sorgudan boş döner ve ad göstermeye zaten ihtiyaç duymaz.
      const { data } = await supabase
        .from("v_ogrenci_dizini")
        .select("id, ad, soyad, sinif_kodu")
        .in("id", [...ogrenciIdleri]);
      for (const o of data ?? []) {
        ogrenciAdi.set(o.id, { ad: `${o.ad} ${o.soyad}`, sinif: o.sinif_kodu });
      }
    })(),
  ]);

  // İmzalı bağlantılar TOPLU üretiliyor: dosya başına ayrı istek, yirmi
  // soruluk bir listede yirmi gidiş-dönüş demekti.
  const yollar = new Set<string>();
  for (const s of ham) {
    if (s.gorsel_yolu) yollar.add(s.gorsel_yolu);
    for (const y of s.question_answers ?? []) if (y.gorsel_yolu) yollar.add(y.gorsel_yolu);
  }

  const imza = new Map<string, string>();
  if (yollar.size) {
    // Bir saat: öğrencinin sayfayı açık bırakması için yeterli, bağlantının
    // paylaşılıp kalıcı hale gelmesi için kısa.
    const { data } = await supabase.storage
      .from(KOVA)
      .createSignedUrls([...yollar], 3600);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) imza.set(d.path, d.signedUrl);
    }
  }

  return ham.map((s) => {
    const ogrenci = ogrenciAdi.get(s.student_id);
    return {
      id: s.id,
      ogrenciId: s.student_id,
      ogrenci: ogrenci?.ad ?? null,
      sinif: ogrenci?.sinif ?? null,
      ders: s.subjects?.ad ?? null,
      konu: s.topics?.ad ?? null,
      metin: s.metin,
      gorselUrl: s.gorsel_yolu ? (imza.get(s.gorsel_yolu) ?? null) : null,
      durum: s.durum,
      hedefOgretmen: s.hedef_ogretmen_id
        ? (ogretmenAdi.get(s.hedef_ogretmen_id) ?? null)
        : null,
      createdAt: s.created_at,
      yanitlar: (s.question_answers ?? [])
        .map((y) => ({
          id: y.id,
          ogretmen: ogretmenAdi.get(y.teacher_id) ?? "Öğretmen",
          metin: y.metin,
          gorselUrl: y.gorsel_yolu ? (imza.get(y.gorsel_yolu) ?? null) : null,
          createdAt: y.created_at,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });
}
