/**
 * Veli panelinin SAF tipleri ve hesapları.
 *
 * `server-only` YOKTUR: istemci bileşenleri buradan import eder.
 * Özet hesabı burada olduğu için test edilebilir.
 */

export interface Ogrenci {
  id: string;
  ad: string;
  soyad: string;
  okulNo: string;
  sinif: string | null;
  yakinlik: string;
}

export interface EtutGecmisi {
  etutId: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  ders: string;
  konu: string | null;
  tur: string;
  derslik: string | null;
  ogretmen: string;
  kayitDurumu: "rezerve" | "beklemede" | "atandi";
  yoklama: "katildi" | "devamsiz" | "mazeretli" | null;
  yildiz: number | null;
  hazirYorumlar: string[];
  yorum: string | null;
}

export interface Ozet {
  /** Yoklaması alınmış etüt sayısı — yüzdelerin paydası. */
  yoklananEtut: number;
  katilim: number;
  devamsizlik: number;
  mazeretli: number;
  /** Katılım yüzdesi; yoklama alınmamışsa null (0% yazmak yanıltıcı olur). */
  katilimYuzdesi: number | null;
  ortalamaYildiz: number | null;
  degerlendirmeSayisi: number;
  yaklasanEtut: number;
  /** Bu ay içindeki etüt sayısı. */
  buAyEtut: number;
}

/**
 * Özet kutuları.
 *
 * DİKKAT: yüzdelerin paydası TOPLAM etüt değil, YOKLAMASI ALINMIŞ etüttür.
 * Öğretmen henüz yoklama almadıysa o etüt hesaba girmez — aksi hâlde veli
 * "katılım %50" görüp öğrencinin gelmediğini sanır, oysa yoklama alınmamıştır.
 */
export function ozetHesapla(gecmis: EtutGecmisi[], bugunIso: string): Ozet {
  const yoklanan = gecmis.filter((g) => g.yoklama !== null);
  const katilim = yoklanan.filter((g) => g.yoklama === "katildi").length;
  const devamsizlik = yoklanan.filter((g) => g.yoklama === "devamsiz").length;
  const mazeretli = yoklanan.filter((g) => g.yoklama === "mazeretli").length;

  const yildizlar = gecmis.filter((g) => g.yildiz !== null).map((g) => g.yildiz!);
  const ayBasi = bugunIso.slice(0, 7);

  return {
    yoklananEtut: yoklanan.length,
    katilim,
    devamsizlik,
    mazeretli,
    katilimYuzdesi: yoklanan.length
      ? Math.round((katilim / yoklanan.length) * 100)
      : null,
    ortalamaYildiz: yildizlar.length
      ? Math.round((yildizlar.reduce((a, b) => a + b, 0) / yildizlar.length) * 10) / 10
      : null,
    degerlendirmeSayisi: yildizlar.length,
    yaklasanEtut: gecmis.filter((g) => g.tarih >= bugunIso).length,
    buAyEtut: gecmis.filter((g) => g.tarih.startsWith(ayBasi)).length,
  };
}

export const YOKLAMA_ETIKET: Record<string, { metin: string; sinif: string }> = {
  katildi: { metin: "Katıldı", sinif: "bg-basarili-acik text-basarili" },
  devamsiz: { metin: "Devamsız", sinif: "bg-marka-acik text-marka-koyu" },
  mazeretli: { metin: "Mazeretli", sinif: "bg-uyari-acik text-uyari" },
};
