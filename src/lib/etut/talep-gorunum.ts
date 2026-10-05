/**
 * Etüt talebinin saf tipleri — istemciye de gider.
 */

export type TalepDurumu = "bekliyor" | "karsilandi" | "reddedildi";

export interface EtutTalebi {
  id: string;
  ogrenciId: string;
  /** Personel görünümünde dolu; öğrenci kendi listesinde null. */
  ogrenci: string | null;
  sinif: string | null;
  ders: string | null;
  konu: string | null;
  neden: string;
  durum: TalepDurumu;
  kararNotu: string | null;
  etutId: string | null;
  createdAt: string;
}

export const TALEP_DURUM_ADI: Record<TalepDurumu, string> = {
  bekliyor: "Bekliyor",
  karsilandi: "Karşılandı",
  reddedildi: "Karşılanamadı",
};

export const TALEP_DURUM_SINIFI: Record<TalepDurumu, string> = {
  bekliyor: "bg-uyari-acik text-uyari",
  karsilandi: "bg-basarili-acik text-basarili",
  reddedildi: "bg-marka-acik text-marka-koyu",
};
