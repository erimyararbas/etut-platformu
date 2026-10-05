/**
 * Çalışma takibinin saf görünüm mantığı — veritabanına dokunmaz.
 *
 * Tarihler yine "YYYY-MM-DD" metni olarak taşınıyor (bkz. lib/etut/takvim.ts):
 * çalışma günü okulun saat diliminde bir takvim günüdür, zaman anı değil.
 */

import { gunEkle } from "@/lib/etut/takvim";

export interface CalismaOturumu {
  id: string;
  goalId: string | null;
  ders: string | null;
  konu: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  sureSaniye: number | null;
  calismaGunu: string;
  /** Sayaç hâlâ açıksa bitiş yoktur. */
  acikMi: boolean;
  not: string | null;
}

export interface Hedef {
  id: string;
  baslik: string;
  ders: string | null;
  konu: string | null;
  hedefSoru: number;
  sonTarih: string | null;
  durum: "aktif" | "tamamlandi" | "iptal";
  /** Atayan öğretmenin adı; öğrencinin kendi hedefiyse null. */
  atayan: string | null;
  /** Bu hedefe bağlı oturumlardan toplanan çözülmüş soru sayısı. */
  cozulen: number;
}

/**
 * Net = D − Y/4.
 *
 * Aynı formül veritabanında da var (`net_hesapla`, 0016). İkisinin ayrışmaması
 * gerekiyor: burası ekranda anlık gösterim için, oradaki raporlar ve toplamlar
 * için. Formül değişirse İKİSİ BİRDEN değişmeli — testler bunu koruyor.
 */
export function net(dogru: number, yanlis: number): number {
  return Math.round((dogru - yanlis / 4) * 100) / 100;
}

export function toplamSoru(o: Pick<CalismaOturumu, "dogru" | "yanlis" | "bos">): number {
  return o.dogru + o.yanlis + o.bos;
}

/**
 * Kesintisiz çalışma serisi.
 *
 * Seri BUGÜN veya DÜN çalışılmışsa canlıdır. Yalnızca bugüne bakmak, gece
 * yarısından sonra henüz çalışmamış öğrencinin serisini sıfırlar ve ekranda
 * "0 günlük seri" görür — oysa serisi duruyor, günü henüz başlamadı.
 */
export function seriUzunlugu(calismaGunleri: string[], bugun: string): number {
  if (calismaGunleri.length === 0) return 0;
  const gunler = new Set(calismaGunleri);

  const dun = gunEkle(bugun, -1);
  let imlec = gunler.has(bugun) ? bugun : gunler.has(dun) ? dun : null;
  if (!imlec) return 0;

  let uzunluk = 0;
  while (gunler.has(imlec)) {
    uzunluk++;
    imlec = gunEkle(imlec, -1);
  }
  return uzunluk;
}

/**
 * Ekranın ihtiyaç duyduğu her şey. Bu tip İSTEMCİYE de gidiyor, o yüzden
 * burada duruyor: `sorgular.ts` "server-only" ve oradan tip almak istemci
 * bileşenini sunucu modülüne bağlardı.
 */
export interface CalismaOzeti {
  bugun: string;
  oturumlar: CalismaOturumu[];
  hedefler: Hedef[];
  /** Sayaç açıksa o oturum; yoksa null. */
  acikOturum: CalismaOturumu | null;
  seri: number;
  hafta: HaftalikOzet;
}

export interface HaftalikOzet {
  soru: number;
  net: number;
  sureSaniye: number;
}

/** Verilen günler arasındaki oturumların toplamı (iki uç da dahil). */
export function haftalikOzet(
  oturumlar: CalismaOturumu[],
  baslangic: string,
  bitis: string,
): HaftalikOzet {
  let soru = 0;
  let dogru = 0;
  let yanlis = 0;
  let sureSaniye = 0;

  for (const o of oturumlar) {
    if (o.calismaGunu < baslangic || o.calismaGunu > bitis) continue;
    soru += toplamSoru(o);
    dogru += o.dogru;
    yanlis += o.yanlis;
    sureSaniye += o.sureSaniye ?? 0;
  }

  return { soru, net: net(dogru, yanlis), sureSaniye };
}

/** "4s 12dk" · bir saatin altında "12dk" · hiç yoksa "—" */
export function sureMetni(saniye: number): string {
  if (saniye <= 0) return "—";
  const dakika = Math.floor(saniye / 60);
  const saat = Math.floor(dakika / 60);
  const kalanDakika = dakika % 60;
  if (saat === 0) return `${kalanDakika}dk`;
  return kalanDakika === 0 ? `${saat}s` : `${saat}s ${kalanDakika}dk`;
}

/** Hedefin yüzde kaçı tamamlandı (0–100, taşma kırpılır). */
export function hedefYuzdesi(h: Pick<Hedef, "cozulen" | "hedefSoru">): number {
  if (h.hedefSoru <= 0) return 0;
  return Math.min(100, Math.round((h.cozulen / h.hedefSoru) * 100));
}

/** "18 soru kaldı" · hedef dolduysa null. */
export function kalanSoruMetni(h: Pick<Hedef, "cozulen" | "hedefSoru">): string | null {
  const kalan = h.hedefSoru - h.cozulen;
  return kalan > 0 ? `${kalan} soru kaldı` : null;
}

export interface GunlukKayit {
  tarih: string;
  soru: number;
  dogru: number;
  yanlis: number;
  bos: number;
  net: number;
  sureSaniye: number;
}

/**
 * Son N günün gün gün toplamı — grafiğin verisi.
 *
 * ÇALIŞILMAYAN GÜNLER DE DÖNER. Grafikte asıl anlatan şey boşluklar: "üç gündür
 * hiç soru çözmemiş" bilgisi, ancak o günler eksende yer kaplarsa görünür.
 * Yalnızca dolu günleri döndürmek düzenli çalışan bir öğrenci yanılsaması
 * yaratırdı.
 */
export function gunlukSeri(
  oturumlar: CalismaOturumu[],
  bitis: string,
  gunSayisi = 14,
): GunlukKayit[] {
  const toplamlar = new Map<string, GunlukKayit>();

  for (const o of oturumlar) {
    // Açık sayaç henüz bitmemiş bir çalışma; grafiğe girmez.
    if (o.acikMi) continue;
    const mevcut = toplamlar.get(o.calismaGunu) ?? {
      tarih: o.calismaGunu,
      soru: 0,
      dogru: 0,
      yanlis: 0,
      bos: 0,
      net: 0,
      sureSaniye: 0,
    };
    mevcut.dogru += o.dogru;
    mevcut.yanlis += o.yanlis;
    mevcut.bos += o.bos;
    mevcut.soru += toplamSoru(o);
    mevcut.sureSaniye += o.sureSaniye ?? 0;
    toplamlar.set(o.calismaGunu, mevcut);
  }

  const seri: GunlukKayit[] = [];
  for (let i = gunSayisi - 1; i >= 0; i--) {
    const tarih = gunEkle(bitis, -i);
    const v = toplamlar.get(tarih);
    seri.push(
      v
        ? { ...v, net: net(v.dogru, v.yanlis) }
        : { tarih, soru: 0, dogru: 0, yanlis: 0, bos: 0, net: 0, sureSaniye: 0 },
    );
  }
  return seri;
}

/** Grafikte kısa gün etiketi: "17 Eyl" */
const KISA_AY = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

export function kisaTarih(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${KISA_AY[Number(iso.slice(5, 7)) - 1]}`;
}
