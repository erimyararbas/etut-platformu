/**
 * Öğretmen çalışma takibinin istemciye de giden saf kısmı.
 */

import { gunEkle } from "@/lib/etut/takvim";

export interface OgrenciCalismasi {
  ogrenciId: string;
  adSoyad: string;
  okulNo: string;
  sinif: string | null;
  soru: number;
  net: number;
  sureSaniye: number;
  /** Aralıktaki son çalışma günü; hiç çalışmadıysa null. */
  sonCalisma: string | null;
  aktifHedef: number;
}

export type SiralamaOlcutu = "sinif" | "soru" | "net" | "calismayan";

export const SIRALAMALAR: { deger: SiralamaOlcutu; etiket: string }[] = [
  { deger: "sinif", etiket: "Sınıfa göre" },
  { deger: "soru", etiket: "En çok soru" },
  { deger: "net", etiket: "En yüksek net" },
  { deger: "calismayan", etiket: "Hiç çalışmayanlar" },
];

/**
 * "Hiç çalışmayanlar" ayrı bir sıralama değil, öğretmenin asıl aradığı liste:
 * takip gerektiren öğrenci, en çok soru çözen değil hiç çözmeyendir. Bu yüzden
 * ölçütler arasında duruyor ve sıfır soru çözenleri öne alıyor.
 */
export function sirala(
  liste: OgrenciCalismasi[],
  olcut: SiralamaOlcutu,
): OgrenciCalismasi[] {
  const kopya = [...liste];
  switch (olcut) {
    case "soru":
      return kopya.sort((a, b) => b.soru - a.soru || a.adSoyad.localeCompare(b.adSoyad, "tr"));
    case "net":
      return kopya.sort((a, b) => b.net - a.net || a.adSoyad.localeCompare(b.adSoyad, "tr"));
    case "calismayan":
      return kopya
        .filter((o) => o.soru === 0)
        .sort(
          (a, b) =>
            (a.sinif ?? "").localeCompare(b.sinif ?? "", "tr") ||
            a.adSoyad.localeCompare(b.adSoyad, "tr"),
        );
    default:
      return kopya.sort(
        (a, b) =>
          (a.sinif ?? "").localeCompare(b.sinif ?? "", "tr") ||
          a.adSoyad.localeCompare(b.adSoyad, "tr"),
      );
  }
}

/** "Bugün" · "Dün" · "3 gün önce" · "Hiç çalışmadı" */
export function sonCalismaMetni(sonCalisma: string | null, bugun: string): string {
  if (!sonCalisma) return "Hiç çalışmadı";
  if (sonCalisma === bugun) return "Bugün";
  if (sonCalisma === gunEkle(bugun, -1)) return "Dün";

  // Küçük bir aralık için gün saymak, tarih aritmetiğinden daha okunur.
  for (let i = 2; i <= 30; i++) {
    if (sonCalisma === gunEkle(bugun, -i)) return `${i} gün önce`;
  }
  return sonCalisma;
}
