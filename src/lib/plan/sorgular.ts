/**
 * Haftalık çalışma planının okuma katmanı.
 *
 * Erişimi RLS belirliyor (0028); burada rol kontrolü tekrarlanmıyor.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { Plan, PlanOgesi } from "./gorunum";

export type * from "./gorunum";
export {
  DURUM_ADI,
  DURUM_SINIFI,
  gunAdi,
  ogeMetni,
  planOzeti,
} from "./gorunum";

interface HamOge {
  id: string;
  gun: string;
  subject_id: string | null;
  topic_id: string | null;
  hedef_soru: number | null;
  durum: PlanOgesi["durum"];
  sira: number;
  subjects: { ad: string } | { ad: string }[] | null;
  topics: { ad: string } | { ad: string }[] | null;
}

/** PostgREST bire-çok gömmede dizi, bire-bir gömmede nesne döndürür. */
function tekAd(x: { ad: string } | { ad: string }[] | null): string | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0]?.ad ?? null) : x.ad;
}

function ogeleriCevir(ham: HamOge[]): PlanOgesi[] {
  return ham
    .map((o) => ({
      id: o.id,
      tarih: o.gun,
      subjectId: o.subject_id,
      ders: tekAd(o.subjects),
      konu: tekAd(o.topics),
      hedefSoru: o.hedef_soru,
      durum: o.durum,
      sira: o.sira,
    }))
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.sira - b.sira);
}

const SECIM = `
  id, student_id, hafta_basi, not_metni, olusturan,
  study_plan_items (
    id, gun, subject_id, topic_id, hedef_soru, durum, sira,
    subjects(ad), topics(ad)
  )
`;

/** Ad çözümü: öğrenci `users` tablosunu okuyamaz, öğretmen dizinini kullanır. */
async function olusturanAdi(
  supabase: Awaited<ReturnType<typeof supabaseSunucu>>,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("v_ogretmen_dizini")
    .select("ad, soyad")
    .eq("id", id)
    .maybeSingle();
  return data ? `${data.ad} ${data.soyad}` : null;
}

function planaCevir(ham: Record<string, unknown>, olusturan: string | null): Plan {
  return {
    id: ham.id as string,
    ogrenciId: ham.student_id as string,
    haftaBasi: ham.hafta_basi as string,
    olusturan,
    notMetni: (ham.not_metni as string | null) ?? null,
    ogeler: ogeleriCevir((ham.study_plan_items ?? []) as HamOge[]),
  };
}

/** Bir öğrencinin belirli haftadaki planı; yoksa null. */
export async function haftaninPlani(
  ogrenciId: string,
  haftaBasi: string,
): Promise<Plan | null> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("study_plans")
    .select(SECIM)
    .eq("student_id", ogrenciId)
    .eq("hafta_basi", haftaBasi)
    .maybeSingle();

  if (error) throw new Error(`Plan okunamadı: ${error.message}`);
  if (!data) return null;

  const ham = data as unknown as Record<string, unknown>;
  return planaCevir(ham, await olusturanAdi(supabase, ham.olusturan as string));
}

/**
 * Öğrencinin son planları — takvim ve geçmiş için.
 *
 * Takvim üç aylık bir pencereye bakıyor; sekiz hafta fazlasıyla yetiyor ve
 * tüm planları çekmekten ucuz.
 */
export async function sonPlanlar(ogrenciId: string, hafta = 8): Promise<Plan[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("study_plans")
    .select(SECIM)
    .eq("student_id", ogrenciId)
    .order("hafta_basi", { ascending: false })
    .limit(hafta);

  if (error) throw new Error(`Planlar okunamadı: ${error.message}`);

  const ham = (data ?? []) as unknown as Record<string, unknown>[];
  const adlar = new Map<string, string | null>();
  for (const p of ham) {
    const id = p.olusturan as string;
    if (!adlar.has(id)) adlar.set(id, await olusturanAdi(supabase, id));
  }
  return ham.map((p) => planaCevir(p, adlar.get(p.olusturan as string) ?? null));
}

/** Takvimde göstermek için tüm plan öğeleri tek listede. */
export async function planOgeleri(ogrenciId: string): Promise<PlanOgesi[]> {
  const planlar = await sonPlanlar(ogrenciId);
  return planlar.flatMap((p) => p.ogeler);
}
