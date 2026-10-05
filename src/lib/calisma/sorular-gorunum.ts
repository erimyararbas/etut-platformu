/**
 * "Çözemediğim sorular" akışının istemciye de giden saf kısmı.
 */

export interface Yanit {
  id: string;
  ogretmen: string;
  metin: string;
  /** İmzalı görüntüleme adresi; görsel yoksa null. */
  gorselUrl: string | null;
  createdAt: string;
}

export interface CozulemeyenSoru {
  id: string;
  ogrenciId: string;
  ogrenci: string | null;
  sinif: string | null;
  ders: string | null;
  konu: string | null;
  metin: string;
  /** İmzalı görüntüleme adresi; görsel yoksa null. */
  gorselUrl: string | null;
  durum: "bekliyor" | "yanitlandi" | "kapandi";
  hedefOgretmen: string | null;
  createdAt: string;
  yanitlar: Yanit[];
}

export const DURUM_ADI: Record<CozulemeyenSoru["durum"], string> = {
  bekliyor: "Yanıt bekliyor",
  yanitlandi: "Yanıtlandı",
  kapandi: "Kapandı",
};

export const DURUM_SINIFI: Record<CozulemeyenSoru["durum"], string> = {
  bekliyor: "border-uyari/30 bg-uyari-acik text-uyari",
  yanitlandi: "border-basarili/30 bg-basarili-acik text-basarili",
  kapandi: "border-cizgi bg-zemin text-soluk",
};

/**
 * Bekleyen sorular önce, sonra en yeni.
 *
 * Öğretmenin ekranında sıralama önemli: yanıtlanmış soru listenin başında
 * durursa bekleyenler aşağı iner ve gözden kaçar.
 */
export function soruSirala(sorular: CozulemeyenSoru[]): CozulemeyenSoru[] {
  const oncelik = { bekliyor: 0, yanitlandi: 1, kapandi: 2 } as const;
  return [...sorular].sort(
    (a, b) =>
      oncelik[a.durum] - oncelik[b.durum] || b.createdAt.localeCompare(a.createdAt),
  );
}
