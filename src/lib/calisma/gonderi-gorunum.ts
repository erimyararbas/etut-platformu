/**
 * Mentör onay kuyruğunun istemciye de giden saf kısmı.
 */

export type GonderiDurumu = "bekliyor" | "onaylandi" | "reddedildi";

export interface Gonderi {
  id: string;
  ogrenciId: string;
  ogrenci: string | null;
  sinif: string | null;
  hedef: string | null;
  aciklama: string;
  /** İmzalı görüntüleme adresi; üretilemezse null. */
  gorselUrl: string | null;
  durum: GonderiDurumu;
  kararNotu: string | null;
  kararVeren: string | null;
  createdAt: string;
}

export const GONDERI_DURUM_ADI: Record<GonderiDurumu, string> = {
  bekliyor: "Bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Geri gönderildi",
};

export const GONDERI_DURUM_SINIFI: Record<GonderiDurumu, string> = {
  bekliyor: "border-uyari/30 bg-uyari-acik text-uyari",
  onaylandi: "border-basarili/30 bg-basarili-acik text-basarili",
  reddedildi: "border-marka/30 bg-marka-acik text-marka-koyu",
};

export const GONDERI_SUZGECLERI: { deger: GonderiDurumu; etiket: string }[] = [
  { deger: "bekliyor", etiket: "Bekleyen" },
  { deger: "onaylandi", etiket: "Onaylanan" },
  { deger: "reddedildi", etiket: "Reddedilen" },
];

/**
 * Bekleyenler önce, sonra en yeni.
 *
 * Öğretmenin ekranında karar verilmiş gönderi listenin başında durursa
 * bekleyenler aşağı iner ve kuyruk işlevini kaybeder.
 */
export function gonderiSirala(gonderiler: Gonderi[]): Gonderi[] {
  const oncelik: Record<GonderiDurumu, number> = {
    bekliyor: 0,
    reddedildi: 1,
    onaylandi: 2,
  };
  return [...gonderiler].sort(
    (a, b) =>
      oncelik[a.durum] - oncelik[b.durum] || b.createdAt.localeCompare(a.createdAt),
  );
}
