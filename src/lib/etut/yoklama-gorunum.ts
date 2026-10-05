/**
 * Yoklama ekranının SAF tipleri ve sabitleri.
 *
 * `server-only` YOKTUR: istemci bileşeni buradan import eder. Veritabanına
 * dokunan kısım `yoklama.ts` içindedir ve istemciye hiç gitmez.
 */

/** Prototipteki hazır yorumlar. */
export const HAZIR_YORUMLAR = [
  "Tebrik ederim.",
  "Çok başarılı.",
  "Daha fazla soru çözmeli.",
  "Konuyu tekrar etmeli.",
  "Derse katılımı artmalı.",
  "Veli desteği gerekli.",
] as const;

export type YoklamaDurumu = "katildi" | "devamsiz" | "mazeretli";

export interface Katilimci {
  ogrenciId: string;
  ad: string;
  soyad: string;
  okulNo: string;
  sinif: string | null;
  /** 'atandi' = sınıf etüdü, öğrenci kendi çıkamaz. */
  kayitDurumu: "rezerve" | "atandi";
  iptalTalebi: "yok" | "bekliyor" | "onaylandi" | "reddedildi";
  iptalNedeni: string | null;
  yoklama: YoklamaDurumu | null;
  yildiz: number | null;
  yorum: string | null;
  hazirYorumlar: string[];
}

export interface EtutKatilim {
  id: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  ders: string;
  konu: string | null;
  tur: string;
  derslik: string | null;
  sinifEtuduMu: boolean;
  /** Yoklama alınabilir mi? (etüt başladı, kilit süresi dolmadı) */
  yoklamaAcik: boolean;
  katilimcilar: Katilimci[];
}

export interface YoklamaBekleyen {
  id: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  ders: string;
  konu: string | null;
  derslik: string | null;
  kayitli: number;
  yoklananSayisi: number;
  degerlendirilen: number;
  yoklamaAcik: boolean;
}
