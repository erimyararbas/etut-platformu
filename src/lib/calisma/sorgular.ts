/**
 * Çalışma takibinin okuma katmanı.
 *
 * Hedef ilerlemesi ayrı bir sayaç kolonundan değil, oturumlardan toplanıyor
 * (bkz. 0016). Oturumlar zaten ekran için çekildiğinden bu toplama ek sorgu
 * getirmiyor ve iki kayıt yerinin ayrışma ihtimalini ortadan kaldırıyor.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import { bugun } from "@/lib/etut/kurallar";
import { haftaBasi } from "@/lib/etut/takvim";
import {
  haftalikOzet,
  seriUzunlugu,
  toplamSoru,
  type CalismaOturumu,
  type CalismaOzeti,
  type Hedef,
} from "./gorunum";

export type { CalismaOturumu, CalismaOzeti, Hedef, HaftalikOzet } from "./gorunum";
export {
  net,
  toplamSoru,
  sureMetni,
  hedefYuzdesi,
  kalanSoruMetni,
  seriUzunlugu,
  haftalikOzet,
} from "./gorunum";

/** Geçmişin tamamı değil; seri ve haftalık özet için bu pencere yeter. */
const GUN_PENCERESI = 120;

interface HamOturum {
  id: string;
  goal_id: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  sure_saniye: number | null;
  calisma_gunu: string;
  bitti_at: string | null;
  not_metni: string | null;
  subjects: { ad: string } | null;
  topics: { ad: string } | null;
}

interface HamHedef {
  id: string;
  baslik: string;
  hedef_soru: number;
  son_tarih: string | null;
  durum: Hedef["durum"];
  assigned_by: string | null;
  subjects: { ad: string } | null;
  topics: { ad: string } | null;
}

export async function calismaOzeti(ogrenciId: string): Promise<CalismaOzeti> {
  const supabase = await supabaseSunucu();
  const simdi = bugun();

  const pencereBasi = new Date(Date.now() - GUN_PENCERESI * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [oturumYanit, hedefYanit] = await Promise.all([
    supabase
      .from("study_sessions")
      .select(
        `id, goal_id, dogru, yanlis, bos, sure_saniye, calisma_gunu, bitti_at,
         not_metni, subjects(ad), topics(ad)`,
      )
      .eq("student_id", ogrenciId)
      .gte("calisma_gunu", pencereBasi)
      .order("calisma_gunu", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("study_goals")
      .select(
        `id, baslik, hedef_soru, son_tarih, durum, assigned_by,
         subjects(ad), topics(ad)`,
      )
      .eq("student_id", ogrenciId)
      .order("durum")
      .order("son_tarih", { nullsFirst: false }),
  ]);

  if (oturumYanit.error) {
    throw new Error(`Çalışma kayıtları okunamadı: ${oturumYanit.error.message}`);
  }
  if (hedefYanit.error) {
    throw new Error(`Hedefler okunamadı: ${hedefYanit.error.message}`);
  }

  const oturumlar: CalismaOturumu[] = ((oturumYanit.data ?? []) as unknown as HamOturum[]).map(
    (o) => ({
      id: o.id,
      goalId: o.goal_id,
      ders: o.subjects?.ad ?? null,
      konu: o.topics?.ad ?? null,
      dogru: o.dogru,
      yanlis: o.yanlis,
      bos: o.bos,
      sureSaniye: o.sure_saniye,
      calismaGunu: o.calisma_gunu,
      acikMi: o.bitti_at === null,
      not: o.not_metni,
    }),
  );

  // Hedef başına çözülen soru: tek geçiş.
  const cozulenler = new Map<string, number>();
  for (const o of oturumlar) {
    if (!o.goalId) continue;
    cozulenler.set(o.goalId, (cozulenler.get(o.goalId) ?? 0) + toplamSoru(o));
  }

  // Atayan öğretmenin adı dar dizinden; users'a doğrudan erişim öğrencide yok.
  const atayanIdleri = [
    ...new Set(
      ((hedefYanit.data ?? []) as unknown as HamHedef[])
        .map((h) => h.assigned_by)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const adlar = new Map<string, string>();
  if (atayanIdleri.length) {
    const { data } = await supabase
      .from("v_ogretmen_dizini")
      .select("id, ad, soyad")
      .in("id", atayanIdleri);
    for (const o of data ?? []) adlar.set(o.id, `${o.ad} ${o.soyad}`);
  }

  const hedefler: Hedef[] = ((hedefYanit.data ?? []) as unknown as HamHedef[]).map((h) => ({
    id: h.id,
    baslik: h.baslik,
    ders: h.subjects?.ad ?? null,
    konu: h.topics?.ad ?? null,
    hedefSoru: h.hedef_soru,
    sonTarih: h.son_tarih,
    durum: h.durum,
    atayan: h.assigned_by ? (adlar.get(h.assigned_by) ?? "Öğretmenin") : null,
    cozulen: cozulenler.get(h.id) ?? 0,
  }));

  const haftaninBasi = haftaBasi(simdi);

  return {
    bugun: simdi,
    oturumlar,
    hedefler,
    acikOturum: oturumlar.find((o) => o.acikMi) ?? null,
    seri: seriUzunlugu(
      // Açık sayaç henüz çalışma sayılmaz; seriyi bitmiş oturumlar kurar.
      oturumlar.filter((o) => !o.acikMi).map((o) => o.calismaGunu),
      simdi,
    ),
    hafta: haftalikOzet(oturumlar, haftaninBasi, simdi),
  };
}
