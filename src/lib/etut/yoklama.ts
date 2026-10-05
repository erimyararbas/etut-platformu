/**
 * Yoklama ve değerlendirme okuma katmanı.
 *
 * Yoklama kilidi kuralı burada TEKRAR YAZILMAZ: `yoklama_alinabilir()`
 * fonksiyonu veritabanındadır ve `attendance_kilit` tetikleyicisi zaten
 * uygular. Buradaki bayrak yalnızca ekranı doğru göstermek için.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type {
  Katilimci,
  EtutKatilim,
  YoklamaBekleyen,
  YoklamaDurumu,
} from "./yoklama-gorunum";

export type {
  YoklamaDurumu,
  Katilimci,
  EtutKatilim,
  YoklamaBekleyen,
} from "./yoklama-gorunum";
export { HAZIR_YORUMLAR } from "./yoklama-gorunum";

/**
 * Öğretmenin bir etüdündeki öğrenciler; yoklama ve değerlendirme durumuyla.
 *
 * Tek etüt için çağrılır, çünkü yoklama ekranı her seferinde bir etütle
 * çalışır ve liste uzun olabilir.
 */
export async function etutKatilimcilari(etutId: string): Promise<EtutKatilim | null> {
  const supabase = await supabaseSunucu();

  const { data: etut, error } = await supabase
    .from("etuts")
    .select(
      `id, tarih, baslangic, bitis, sinif_etudu_mu,
       subjects(ad), topics(ad), etut_types(ad), rooms(kod)`,
    )
    .eq("id", etutId)
    .maybeSingle();

  if (error) throw new Error(`Etüt okunamadı: ${error.message}`);
  if (!etut) return null;

  const [{ data: acik }, kayitlar, yoklamalar, degerlendirmeler] = await Promise.all([
    supabase.rpc("yoklama_alinabilir", { p_etut_id: etutId }),
    supabase
      .from("reservations")
      .select("student_id, durum, iptal_talebi, iptal_talep_nedeni")
      .eq("etut_id", etutId)
      .in("durum", ["rezerve", "atandi"]),
    supabase.from("attendance").select("student_id, durum").eq("etut_id", etutId),
    supabase
      .from("evaluations")
      .select("student_id, yildiz, yorum, hazir_yorumlar")
      .eq("etut_id", etutId),
  ]);

  const ogrenciIdleri = (kayitlar.data ?? []).map((r) => r.student_id);
  const dizin = new Map<string, { ad: string; soyad: string; okul_no: string; sinif_kodu: string | null }>();

  if (ogrenciIdleri.length) {
    // Ad/soyad dar görünümden — `users` tablosu öğretmene kapalı.
    const { data: ogrenciler } = await supabase
      .from("v_ogrenci_dizini")
      .select("id, ad, soyad, okul_no, sinif_kodu")
      .in("id", ogrenciIdleri);
    for (const o of ogrenciler ?? []) dizin.set(o.id, o);
  }

  const yoklamaHarita = new Map((yoklamalar.data ?? []).map((y) => [y.student_id, y.durum]));
  const degHarita = new Map((degerlendirmeler.data ?? []).map((d) => [d.student_id, d]));

  const katilimcilar: Katilimci[] = (kayitlar.data ?? [])
    .map((r) => {
      const k = dizin.get(r.student_id);
      const d = degHarita.get(r.student_id);
      return {
        ogrenciId: r.student_id,
        ad: k?.ad ?? "—",
        soyad: k?.soyad ?? "",
        okulNo: k?.okul_no ?? "",
        sinif: k?.sinif_kodu ?? null,
        kayitDurumu: r.durum as "rezerve" | "atandi",
        iptalTalebi: r.iptal_talebi as Katilimci["iptalTalebi"],
        iptalNedeni: r.iptal_talep_nedeni ?? null,
        yoklama: (yoklamaHarita.get(r.student_id) as YoklamaDurumu | undefined) ?? null,
        yildiz: d?.yildiz ?? null,
        yorum: d?.yorum ?? null,
        hazirYorumlar: (d?.hazir_yorumlar as string[] | undefined) ?? [],
      };
    })
    .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));

  const ders = etut.subjects as unknown as { ad: string } | null;
  const konu = etut.topics as unknown as { ad: string } | null;
  const tur = etut.etut_types as unknown as { ad: string } | null;
  const oda = etut.rooms as unknown as { kod: string } | null;

  return {
    id: etut.id,
    tarih: etut.tarih,
    baslangic: etut.baslangic.slice(0, 5),
    bitis: etut.bitis.slice(0, 5),
    ders: ders?.ad ?? "—",
    konu: konu?.ad ?? null,
    tur: tur?.ad ?? "—",
    derslik: oda?.kod ?? null,
    sinifEtuduMu: etut.sinif_etudu_mu,
    yoklamaAcik: Boolean(acik),
    katilimcilar,
  };
}

/**
 * Öğretmenin başlamış etütleri — yoklama ve değerlendirme durumuyla.
 * Yaklaşan etütler listelenmez; yoklama ancak etüt başladıktan sonra alınır.
 */
export async function yoklamaListesi(ogretmenId: string): Promise<YoklamaBekleyen[]> {
  const supabase = await supabaseSunucu();

  const { data, error } = await supabase
    .from("etuts")
    .select("id, tarih, baslangic, bitis, subjects(ad), topics(ad), rooms(kod)")
    .eq("teacher_id", ogretmenId)
    .eq("durum", "onaylandi")
    .order("tarih", { ascending: false })
    .order("baslangic", { ascending: false })
    .limit(60);

  if (error) throw new Error(`Etütler okunamadı: ${error.message}`);
  const etutler = data ?? [];
  if (!etutler.length) return [];

  const idler = etutler.map((e) => e.id);

  const [kayitlar, yoklamalar, degerlendirmeler, acikDurumlar] = await Promise.all([
    supabase
      .from("reservations")
      .select("etut_id, durum")
      .in("etut_id", idler)
      .in("durum", ["rezerve", "atandi"]),
    supabase.from("attendance").select("etut_id").in("etut_id", idler),
    supabase.from("evaluations").select("etut_id").in("etut_id", idler),
    // Kilit durumu tek tek sorulmak zorunda: zaman kuralı veritabanında.
    Promise.all(
      idler.map(async (id) => {
        const { data } = await supabase.rpc("yoklama_alinabilir", { p_etut_id: id });
        return [id, Boolean(data)] as const;
      }),
    ),
  ]);

  const say = (satirlar: { etut_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const s of satirlar ?? []) m.set(s.etut_id, (m.get(s.etut_id) ?? 0) + 1);
    return m;
  };

  const kayitSayi = say(kayitlar.data);
  const yoklamaSayi = say(yoklamalar.data);
  const degSayi = say(degerlendirmeler.data);
  const acik = new Map(acikDurumlar);

  return etutler
    .map((e) => {
      const ders = e.subjects as unknown as { ad: string } | null;
      const konu = e.topics as unknown as { ad: string } | null;
      const oda = e.rooms as unknown as { kod: string } | null;
      return {
        id: e.id,
        tarih: e.tarih,
        baslangic: e.baslangic.slice(0, 5),
        bitis: e.bitis.slice(0, 5),
        ders: ders?.ad ?? "—",
        konu: konu?.ad ?? null,
        derslik: oda?.kod ?? null,
        kayitli: kayitSayi.get(e.id) ?? 0,
        yoklananSayisi: yoklamaSayi.get(e.id) ?? 0,
        degerlendirilen: degSayi.get(e.id) ?? 0,
        yoklamaAcik: acik.get(e.id) ?? false,
      };
    })
    // Henüz başlamamış etütlerde yapılacak bir şey yok.
    .filter((e) => e.yoklamaAcik || e.yoklananSayisi > 0);
}
