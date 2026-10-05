/**
 * Rehberlik ekranının istemciye de giden saf kısmı.
 */

export interface RiskKaydi {
  ogrenciId: string;
  adSoyad: string;
  sinif: string | null;
  mentor: string | null;
  skor: number;
  devamsizlik: number;
  katilim: number | null;
  ortYildiz: number | null;
  acikVaka: number;
  gerekceler: string[];
}

export type VakaDurumu = "acik" | "izlemede" | "kapandi";
export type VakaOnceligi = "dusuk" | "normal" | "yuksek";

export interface Vaka {
  id: string;
  ogrenciId: string;
  ogrenci: string | null;
  sinif: string | null;
  baslik: string;
  oncelik: VakaOnceligi;
  durum: VakaDurumu;
  acan: string | null;
  notSayisi: number;
  createdAt: string;
}

export interface GorusmeNotu {
  id: string;
  yazan: string | null;
  metin: string;
  gorunurluk: string[];
  yalnizcaYazan: boolean;
  createdAt: string;
}

export type RandevuDurumu =
  | "talep"
  | "planlandi"
  | "onaylandi"
  | "iptal"
  | "tamamlandi";

export interface Randevu {
  id: string;
  ogrenciId: string;
  ogrenci: string | null;
  sinif: string | null;
  tur: "bireysel" | "veli" | "grup";
  tarih: string | null;
  baslangic: string | null;
  durum: RandevuDurumu;
  talepEden: string | null;
  talepNotu: string | null;
  retNedeni: string | null;
}

export const VAKA_DURUM_ADI: Record<VakaDurumu, string> = {
  acik: "Açık",
  izlemede: "İzlemede",
  kapandi: "Kapandı",
};

export const ONCELIK_ADI: Record<VakaOnceligi, string> = {
  yuksek: "Öncelikli",
  normal: "Normal",
  dusuk: "Düşük",
};

export const ONCELIK_SINIFI: Record<VakaOnceligi, string> = {
  yuksek: "border-marka/30 bg-marka-acik text-marka-koyu",
  normal: "border-cizgi bg-zemin text-soluk",
  dusuk: "border-cizgi bg-zemin text-soluk",
};

export const RANDEVU_DURUM_ADI: Record<RandevuDurumu, string> = {
  talep: "Talep",
  planlandi: "Planlandı",
  onaylandi: "Onaylandı",
  iptal: "İptal",
  tamamlandi: "Tamamlandı",
};

export const RANDEVU_TUR_ADI: Record<Randevu["tur"], string> = {
  bireysel: "Bireysel görüşme",
  veli: "Veli görüşmesi",
  grup: "Grup görüşmesi",
};

/**
 * Risk bandı — skoru bir etikete çevirir.
 *
 * Etiket "öncelikli / takip / izleme" diyor; öğrenci hakkında bir nitelik
 * bildirmiyor. Bu ayrım önemli: skor rehberin sırasını belirler, öğrenciyi
 * tanımlamaz.
 */
export function riskBandi(skor: number): { etiket: string; sinif: string } {
  if (skor >= 60) {
    return { etiket: "Öncelikli", sinif: "border-marka/30 bg-marka-acik text-marka-koyu" };
  }
  if (skor >= 35) {
    return { etiket: "Takip", sinif: "border-uyari/30 bg-uyari-acik text-uyari" };
  }
  return { etiket: "İzleme", sinif: "border-cizgi bg-zemin text-soluk" };
}

/** Görünürlük dizisini okunur metne çevirir. */
const ROL_METNI: Record<string, string> = {
  rehber: "rehberlik",
  mentor: "mentör",
  ogretmen: "öğretmenler",
  veli: "veli",
  admin: "yönetim",
  ogrenci: "öğrenci",
};

export function gorunurlukMetni(roller: string[], yalnizcaYazan: boolean): string {
  if (yalnizcaYazan) return "yalnızca ben";
  const digerleri = roller.filter((r) => r !== "rehber").map((r) => ROL_METNI[r] ?? r);
  return digerleri.length === 0
    ? "yalnızca rehberlik"
    : `rehberlik + ${digerleri.join(", ")}`;
}
