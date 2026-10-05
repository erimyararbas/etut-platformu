/**
 * Deneme sınavlarının SAF tipleri ve hesapları — veritabanına dokunmaz.
 *
 * `server-only` YOKTUR: rehber paneli ve öğrenci ekranı istemci bileşeni ve
 * buradan tip alıyor.
 *
 * NET BURADA YENİDEN HESAPLANMAZ. Veritabanı `net_hesapla` ile hesaplayıp
 * gönderiyor (0027); burada yalnızca toplanıyor. Çalışma takibindeki `net()`
 * fonksiyonunun bir kopyasını buraya yazmak, aynı öğrencinin iki ekranda
 * farklı net görmesine giden en kısa yol olurdu.
 */

export interface DenemeDersSonucu {
  subjectId: string;
  ders: string;
  dogru: number;
  yanlis: number;
  bos: number;
  net: number;
}

export interface DenemeSonucu {
  examId: string;
  ad: string;
  tarih: string;
  tur: string | null;
  puan: number | null;
  siralama: number | null;
  dersler: DenemeDersSonucu[];
  toplamNet: number;
  toplamSoru: number;
}

/** Rehberin sınav ekranındaki bir satır. */
export interface DenemeOgrenciSatiri {
  ogrenciId: string;
  adSoyad: string;
  okulNo: string;
  sinif: string | null;
  puan: number | null;
  siralama: number | null;
  toplamNet: number;
  dersSayisi: number;
}

export interface Deneme {
  id: string;
  ad: string;
  tarih: string;
  tur: string | null;
  /** Sonuç girilmiş öğrenci sayısı. */
  ogrenciSayisi: number;
}

/** `ogrenci_deneme_gecmisi`'nin bir satırı: bir sınav, bir ders. */
export interface GecmisSatiri {
  examId: string;
  ad: string;
  tarih: string;
  tur: string | null;
  puan: number | null;
  siralama: number | null;
  subjectId: string;
  ders: string;
  dogru: number;
  yanlis: number;
  bos: number;
  net: number;
}

/**
 * Sınav × ders satırlarını sınav başına toplar.
 *
 * Sıralama yeniden eskiye: öğrenci "son denemem ne oldu" sorusunu soruyor,
 * "ilk denemem ne olmuştu" sorusunu değil.
 */
export function denemeleriGrupla(satirlar: GecmisSatiri[]): DenemeSonucu[] {
  const harita = new Map<string, DenemeSonucu>();

  for (const r of satirlar) {
    let d = harita.get(r.examId);
    if (!d) {
      d = {
        examId: r.examId,
        ad: r.ad,
        tarih: r.tarih,
        tur: r.tur,
        puan: r.puan,
        siralama: r.siralama,
        dersler: [],
        toplamNet: 0,
        toplamSoru: 0,
      };
      harita.set(r.examId, d);
    }
    d.dersler.push({
      subjectId: r.subjectId,
      ders: r.ders,
      dogru: r.dogru,
      yanlis: r.yanlis,
      bos: r.bos,
      net: r.net,
    });
    d.toplamNet += r.net;
    d.toplamSoru += r.dogru + r.yanlis + r.bos;
  }

  return [...harita.values()]
    .map((d) => ({ ...d, toplamNet: Math.round(d.toplamNet * 100) / 100 }))
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
}

/**
 * Bir dersin denemeler boyunca net gelişimi — grafiğe verilecek seri.
 *
 * ESKİDEN YENİYE sıralı: grafik soldan sağa zaman akar. Liste yeniden eskiye
 * sıralı olduğu için burada ters çevrilmesi gerekiyor; bu ayrım kaçırılırsa
 * gelişim grafiği ters okunur ve düşen bir öğrenci yükseliyor görünür.
 */
export function netGelisimi(
  sonuclar: DenemeSonucu[],
  subjectId?: string,
): { tarih: string; ad: string; net: number }[] {
  return [...sonuclar]
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .map((d) => ({
      tarih: d.tarih,
      ad: d.ad,
      net: subjectId
        ? (d.dersler.find((x) => x.subjectId === subjectId)?.net ?? 0)
        : d.toplamNet,
    }));
}

/** Sınavda sonucu olan öğrencilerin ortalama neti; kimse yoksa null. */
export function ortalamaNet(satirlar: DenemeOgrenciSatiri[]): number | null {
  if (!satirlar.length) return null;
  const toplam = satirlar.reduce((t, r) => t + r.toplamNet, 0);
  return Math.round((toplam / satirlar.length) * 100) / 100;
}

/** Öğrencinin son iki denemesi arasındaki fark; tek deneme varsa null. */
export function sonDegisim(sonuclar: DenemeSonucu[]): number | null {
  if (sonuclar.length < 2) return null;
  // Liste yeniden eskiye sıralı: [0] son deneme, [1] ondan önceki.
  return Math.round((sonuclar[0].toplamNet - sonuclar[1].toplamNet) * 100) / 100;
}

/** "17.09.2026" */
export function tarihKisa(iso: string): string {
  const [y, a, g] = iso.split("-");
  return `${g}.${a}.${y}`;
}
