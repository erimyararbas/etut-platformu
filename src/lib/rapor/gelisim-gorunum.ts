/**
 * Gelişim raporunun SAF hesapları — veritabanına dokunmaz, test edilebilir.
 *
 * `server-only` YOKTUR: rapor sayfasının bileşenleri buradan tip ve hesap alır.
 *
 * YÜZDE KURALI, katılım raporuyla (lib/rapor/katilim-ozet.ts) ve veli
 * paneliyle (lib/veli/gorunum.ts) AYNI olmak zorunda: payda katıldı + devamsız,
 * mazeretli hiçbirine girmez. Üç ekran aynı öğrenci için farklı yüzde
 * gösterirse hangisinin doğru olduğu sorulamaz hâle gelir.
 */

import type { EtutGecmisi } from "@/lib/veli/gorunum";
import { net, toplamSoru } from "@/lib/calisma/gorunum";

export type { EtutGecmisi };

export interface Kimlik {
  ad: string;
  soyad: string;
  okulNo: string;
  sinif: string | null;
  mentor: string | null;
  okulAdi: string;
}

/** `ogrenci_calisma_dokumu`'nun bir satırı: bir gün, bir ders. */
export interface CalismaSatiri {
  gun: string;
  ders: string;
  dogru: number;
  yanlis: number;
  bos: number;
  sureSaniye: number;
}

export interface HedefOzeti {
  aktif: number;
  tamamlandi: number;
  ogretmenden: number;
}

export interface DersKatilimi {
  ders: string;
  toplam: number;
  katildi: number;
  devamsiz: number;
  mazeretli: number;
  katilimYuzdesi: number | null;
  ortalamaYildiz: number | null;
}

export interface DersCalismasi {
  ders: string;
  soru: number;
  net: number;
  sureSaniye: number;
}

export interface RaporOzeti {
  /** Yoklaması alınmış etüt sayısı — yüzdenin paydası buradan çıkar. */
  yoklananEtut: number;
  katildi: number;
  devamsiz: number;
  mazeretli: number;
  katilimYuzdesi: number | null;
  ortalamaYildiz: number | null;
  degerlendirmeSayisi: number;
  /** Aralıkta kaydı olan ama henüz yoklaması alınmamış etüt. */
  yoklanmayanEtut: number;
  soru: number;
  net: number;
  sureSaniye: number;
  calisilanGun: number;
}

/** Aralığa düşen etütler (iki uç da dahil). */
export function aralikEtutleri(
  gecmis: EtutGecmisi[],
  baslangic: string,
  bitis: string,
): EtutGecmisi[] {
  return gecmis.filter((e) => e.tarih >= baslangic && e.tarih <= bitis);
}

export function ozetHesapla(
  etutler: EtutGecmisi[],
  calisma: CalismaSatiri[],
): RaporOzeti {
  const katildi = etutler.filter((e) => e.yoklama === "katildi").length;
  const devamsiz = etutler.filter((e) => e.yoklama === "devamsiz").length;
  const mazeretli = etutler.filter((e) => e.yoklama === "mazeretli").length;
  const yildizlar = etutler.filter((e) => e.yildiz !== null).map((e) => e.yildiz!);

  const payda = katildi + devamsiz;
  let dogru = 0;
  let yanlis = 0;
  let soru = 0;
  let sureSaniye = 0;
  const gunler = new Set<string>();

  for (const c of calisma) {
    dogru += c.dogru;
    yanlis += c.yanlis;
    soru += c.dogru + c.yanlis + c.bos;
    sureSaniye += c.sureSaniye;
    gunler.add(c.gun);
  }

  return {
    yoklananEtut: katildi + devamsiz + mazeretli,
    katildi,
    devamsiz,
    mazeretli,
    katilimYuzdesi: payda === 0 ? null : Math.round((katildi / payda) * 100),
    ortalamaYildiz: yildizlar.length
      ? Math.round((yildizlar.reduce((a, b) => a + b, 0) / yildizlar.length) * 10) / 10
      : null,
    degerlendirmeSayisi: yildizlar.length,
    yoklanmayanEtut: etutler.filter((e) => e.yoklama === null).length,
    soru,
    net: net(dogru, yanlis),
    sureSaniye,
    calisilanGun: gunler.size,
  };
}

/**
 * Ders bazında katılım.
 *
 * Yoklaması alınmamış etütler sayılmaz: "11 etüdün 4'ünde devamsız" yazıp
 * kalan 7'sinin yoklamasının hiç alınmadığını gizlemek, veliye olmayan bir
 * devamsızlık tablosu gösterirdi.
 */
export function dersBazindaKatilim(etutler: EtutGecmisi[]): DersKatilimi[] {
  const harita = new Map<string, DersKatilimi & { yToplam: number; yAdet: number }>();

  for (const e of etutler) {
    if (e.yoklama === null) continue;

    let d = harita.get(e.ders);
    if (!d) {
      d = {
        ders: e.ders,
        toplam: 0,
        katildi: 0,
        devamsiz: 0,
        mazeretli: 0,
        katilimYuzdesi: null,
        ortalamaYildiz: null,
        yToplam: 0,
        yAdet: 0,
      };
      harita.set(e.ders, d);
    }

    d.toplam++;
    if (e.yoklama === "katildi") d.katildi++;
    else if (e.yoklama === "devamsiz") d.devamsiz++;
    else d.mazeretli++;

    if (e.yildiz !== null) {
      d.yToplam += e.yildiz;
      d.yAdet++;
    }
  }

  return [...harita.values()]
    .map(({ yToplam, yAdet, ...d }) => {
      const payda = d.katildi + d.devamsiz;
      return {
        ...d,
        katilimYuzdesi: payda === 0 ? null : Math.round((d.katildi / payda) * 100),
        ortalamaYildiz: yAdet === 0 ? null : Math.round((yToplam / yAdet) * 10) / 10,
      };
    })
    .sort((a, b) => b.toplam - a.toplam || a.ders.localeCompare(b.ders, "tr"));
}

export function dersBazindaCalisma(satirlar: CalismaSatiri[]): DersCalismasi[] {
  const harita = new Map<string, { soru: number; dogru: number; yanlis: number; sure: number }>();

  for (const s of satirlar) {
    const d = harita.get(s.ders) ?? { soru: 0, dogru: 0, yanlis: 0, sure: 0 };
    d.soru += s.dogru + s.yanlis + s.bos;
    d.dogru += s.dogru;
    d.yanlis += s.yanlis;
    d.sure += s.sureSaniye;
    harita.set(s.ders, d);
  }

  return [...harita.entries()]
    .map(([ders, d]) => ({
      ders,
      soru: d.soru,
      net: net(d.dogru, d.yanlis),
      sureSaniye: d.sure,
    }))
    .sort((a, b) => b.soru - a.soru || a.ders.localeCompare(b.ders, "tr"));
}

/**
 * Aralığa düşen denemeler.
 *
 * Etütlerle aynı süzgeç mantığı ama ayrı bir fonksiyon: deneme listesi zaten
 * yeniden eskiye sıralı geliyor (bkz. denemeleriGrupla) ve o sıra korunmalı.
 */
export function aralikDenemeleri<T extends { tarih: string }>(
  denemeler: T[],
  baslangic: string,
  bitis: string,
): T[] {
  return denemeler.filter((d) => d.tarih >= baslangic && d.tarih <= bitis);
}

/** Öğretmen yorumu bulunan etütler, yeniden eskiye. */
export function yorumlar(etutler: EtutGecmisi[]): EtutGecmisi[] {
  return etutler
    .filter((e) => (e.yorum?.trim().length ?? 0) > 0 || e.hazirYorumlar.length > 0)
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
}

/** "4s 12dk" · bir saatin altında "12dk" · hiç yoksa "—" */
export function sureMetni(saniye: number): string {
  if (saniye <= 0) return "—";
  const dakika = Math.round(saniye / 60);
  const saat = Math.floor(dakika / 60);
  const kalan = dakika % 60;
  if (saat === 0) return `${kalan}dk`;
  return kalan === 0 ? `${saat}s` : `${saat}s ${kalan}dk`;
}

/** "1 Eylül 2026" — rapor başlığında gün adı gerekmiyor. */
export function tarihUzun(iso: string): string {
  const [y, a, g] = iso.split("-").map(Number);
  const aylar = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  return `${g} ${aylar[a - 1]} ${y}`;
}

/** "01.09.2026" — tablolarda yer dar. */
export function tarihKisa(iso: string): string {
  const [y, a, g] = iso.split("-");
  return `${g}.${a}.${y}`;
}

export const YOKLAMA_ADI: Record<"katildi" | "devamsiz" | "mazeretli", string> = {
  katildi: "Katıldı",
  devamsiz: "Devamsız",
  mazeretli: "Mazeretli",
};

export { toplamSoru };
