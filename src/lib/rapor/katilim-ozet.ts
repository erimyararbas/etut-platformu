/**
 * Katılım raporunun saf hesap kısmı — veritabanına dokunmaz, test edilebilir.
 */

export interface KatilimSatiri {
  okulNo: string;
  ad: string;
  soyad: string;
  sinif: string | null;
  tarih: string;
  baslangic: string;
  bitis: string;
  ders: string | null;
  tur: string | null;
  ogretmen: string | null;
  derslik: string | null;
  durum: "katildi" | "devamsiz" | "mazeretli";
  yildiz: number | null;
  yorum: string | null;
}

export interface OgrenciOzeti {
  okulNo: string;
  adSoyad: string;
  sinif: string | null;
  toplam: number;
  katildi: number;
  devamsiz: number;
  mazeretli: number;
  /** 0–100 arası tam sayı; hiç kaydı yoksa null. */
  katilimYuzdesi: number | null;
  /** Bir ondalık basamağa yuvarlanmış ortalama; değerlendirme yoksa null. */
  ortalamaYildiz: number | null;
}

/**
 * Öğrenci bazında özet.
 *
 * KATILIM YÜZDESİ MAZERETLİYİ SAYMAZ: mazeretli bir devamsızlık öğrencinin
 * aleyhine yazılmamalı, ama "katıldı" da sayılmamalı. Bu yüzden payda
 * katıldı + devamsız; yalnızca mazeretli kaydı olan öğrencide yüzde null döner
 * ve ekranda "—" görünür. Mazeretliyi paydaya koymak, raporu velinin gözünde
 * haksız biçimde düşürürdü.
 */
export function ogrenciOzetleri(satirlar: KatilimSatiri[]): OgrenciOzeti[] {
  const harita = new Map<string, OgrenciOzeti & { yildizToplam: number; yildizAdet: number }>();

  for (const s of satirlar) {
    let o = harita.get(s.okulNo);
    if (!o) {
      o = {
        okulNo: s.okulNo,
        adSoyad: `${s.ad} ${s.soyad}`,
        sinif: s.sinif,
        toplam: 0,
        katildi: 0,
        devamsiz: 0,
        mazeretli: 0,
        katilimYuzdesi: null,
        ortalamaYildiz: null,
        yildizToplam: 0,
        yildizAdet: 0,
      };
      harita.set(s.okulNo, o);
    }

    o.toplam++;
    if (s.durum === "katildi") o.katildi++;
    else if (s.durum === "devamsiz") o.devamsiz++;
    else o.mazeretli++;

    if (s.yildiz !== null) {
      o.yildizToplam += s.yildiz;
      o.yildizAdet++;
    }
  }

  return [...harita.values()]
    .map((o) => {
      const payda = o.katildi + o.devamsiz;
      const { yildizToplam, yildizAdet, ...temiz } = o;
      return {
        ...temiz,
        katilimYuzdesi: payda === 0 ? null : Math.round((o.katildi / payda) * 100),
        ortalamaYildiz:
          yildizAdet === 0 ? null : Math.round((yildizToplam / yildizAdet) * 10) / 10,
      };
    })
    .sort(
      (a, b) =>
        (a.sinif ?? "").localeCompare(b.sinif ?? "", "tr") ||
        a.adSoyad.localeCompare(b.adSoyad, "tr"),
    );
}

export const DURUM_ADI: Record<KatilimSatiri["durum"], string> = {
  katildi: "Katıldı",
  devamsiz: "Devamsız",
  mazeretli: "Mazeretli",
};

/** Dosya adı: "katilim-2026-09-01_2026-09-30.xlsx" */
export function dosyaAdi(baslangic: string, bitis: string): string {
  return `katilim-${baslangic}_${bitis}.xlsx`;
}
