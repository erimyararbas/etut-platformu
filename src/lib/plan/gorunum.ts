/**
 * Haftalık çalışma planının SAF tipleri ve hesapları.
 *
 * `server-only` YOKTUR: hem rehber paneli hem öğrenci ekranı hem takvim
 * istemci bileşeni ve buradan tip alıyor.
 *
 * DİKKAT — alan adı `tarih`: veritabanındaki kolon `gun`, ama görünüm tipinde
 * `tarih` deniyor. Böylece plan öğeleri takvimin mevcut `gunlereGore()`
 * yardımcısından (lib/etut/takvim.ts, `{ tarih: string }` bekler) geçebiliyor
 * ve takvime ikinci bir gruplama kodu yazmak gerekmiyor.
 */

export type PlanOgesiDurumu = "bekliyor" | "yapildi" | "yapilmadi";

export interface PlanOgesi {
  id: string;
  /** "YYYY-MM-DD" — bkz. dosya başlığı, takvim yardımcısıyla uyum için. */
  tarih: string;
  subjectId: string | null;
  ders: string | null;
  konu: string | null;
  hedefSoru: number | null;
  durum: PlanOgesiDurumu;
  sira: number;
}

export interface Plan {
  id: string;
  ogrenciId: string;
  /** Haftanın pazartesisi. */
  haftaBasi: string;
  /** Planı yazan kişinin adı; çözülemezse null. */
  olusturan: string | null;
  notMetni: string | null;
  ogeler: PlanOgesi[];
}

export interface PlanOzeti {
  toplam: number;
  yapildi: number;
  yapilmadi: number;
  bekliyor: number;
  /** Yalnızca İŞARETLENMİŞ öğeler üzerinden; hiç işaret yoksa null. */
  yuzde: number | null;
}

export const DURUM_ADI: Record<PlanOgesiDurumu, string> = {
  bekliyor: "Bekliyor",
  yapildi: "Yapıldı",
  yapilmadi: "Yapılmadı",
};

export const DURUM_SINIFI: Record<PlanOgesiDurumu, string> = {
  bekliyor: "bg-zemin text-soluk",
  yapildi: "bg-basarili-acik text-basarili",
  yapilmadi: "bg-marka-acik text-marka-koyu",
};

/**
 * Plan özeti.
 *
 * YÜZDE PAYDASI İŞARETLENMİŞ ÖĞELER. Henüz günü gelmemiş satırları paydaya
 * koymak, haftanın başında her öğrenciyi "%14 tamamladı" gibi gösterirdi —
 * oysa daha hiçbir şey olmamıştır. Katılım yüzdesindeki mazeretli kuralıyla
 * aynı mantık: ölçülmemiş olan aleyhe yazılmaz.
 */
export function planOzeti(ogeler: PlanOgesi[]): PlanOzeti {
  const yapildi = ogeler.filter((o) => o.durum === "yapildi").length;
  const yapilmadi = ogeler.filter((o) => o.durum === "yapilmadi").length;
  const isaretli = yapildi + yapilmadi;

  return {
    toplam: ogeler.length,
    yapildi,
    yapilmadi,
    bekliyor: ogeler.filter((o) => o.durum === "bekliyor").length,
    yuzde: isaretli === 0 ? null : Math.round((yapildi / isaretli) * 100),
  };
}

/** Bir öğeyi tek satırda anlatır: "Matematik · Türev · 40 soru" */
export function ogeMetni(o: PlanOgesi): string {
  const parcalar = [o.ders, o.konu].filter(Boolean) as string[];
  if (o.hedefSoru) parcalar.push(`${o.hedefSoru} soru`);
  return parcalar.length ? parcalar.join(" · ") : "Serbest çalışma";
}

/** Gün adı: "Pazartesi" */
const GUN_ADLARI = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

export function gunAdi(iso: string): string {
  const [y, a, g] = iso.split("-").map(Number);
  // getUTCDay: 0 = Pazar. Pazartesi başlangıçlı diziye çeviriyoruz.
  const d = new Date(Date.UTC(y, a - 1, g)).getUTCDay();
  return GUN_ADLARI[(d + 6) % 7];
}
