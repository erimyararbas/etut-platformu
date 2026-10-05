/**
 * Etüt oluşturmanın saf kuralları — veritabanına dokunmaz, test edilebilir.
 *
 * Kontenjan, bekleme listesi ve çakışma kuralları burada DEĞİL, veritabanında
 * duruyor (bkz. supabase/migrations/0002). Burada yalnızca formdan gelen
 * girdinin anlamlandırılması var: tarih üretimi, saat aralığı, kontenjan
 * hesabı gibi.
 */

export const HAFTA_GUNLERI = [
  { no: 1, kisa: "Pt", ad: "Pazartesi" },
  { no: 2, kisa: "Sa", ad: "Salı" },
  { no: 3, kisa: "Ça", ad: "Çarşamba" },
  { no: 4, kisa: "Pe", ad: "Perşembe" },
  { no: 5, kisa: "Cu", ad: "Cuma" },
  { no: 6, kisa: "Ct", ad: "Cumartesi" },
  { no: 7, kisa: "Pa", ad: "Pazar" },
] as const;

/** Prototipteki tekrar süreleri. */
export const TEKRAR_SURELERI = [
  { hafta: 4, etiket: "4 hafta" },
  { hafta: 8, etiket: "8 hafta" },
  { hafta: 12, etiket: "12 hafta (dönem boyu)" },
] as const;

/** Etüt saatleri 15 dakikalık adımlarla; okul günü 07:00–22:00 arası. */
export function saatSecenekleri(baslangicSaat = 7, bitisSaat = 22): string[] {
  const liste: string[] = [];
  for (let s = baslangicSaat; s <= bitisSaat; s++) {
    for (const d of [0, 15, 30, 45]) {
      if (s === bitisSaat && d > 0) break;
      liste.push(`${String(s).padStart(2, "0")}:${String(d).padStart(2, "0")}`);
    }
  }
  return liste;
}

/** "16:00" → dakika. Geçersizse null. */
export function saatiDakikayaCevir(saat: string): number | null {
  const m = saat.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const s = Number(m[1]);
  const d = Number(m[2]);
  if (s > 23 || d > 59) return null;
  return s * 60 + d;
}

/** Bitişi başlangıçtan `dakika` sonra hesaplar. */
export function bitisSaati(baslangic: string, dakika: number): string | null {
  const b = saatiDakikayaCevir(baslangic);
  if (b === null) return null;
  const t = b + dakika;
  if (t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export interface SureHatasi {
  hata: string;
}

/** Saat aralığının geçerliliği. */
export function araligiDogrula(
  baslangic: string,
  bitis: string,
): SureHatasi | { baslangic: string; bitis: string; dakika: number } {
  const b = saatiDakikayaCevir(baslangic);
  const s = saatiDakikayaCevir(bitis);
  if (b === null) return { hata: "Başlangıç saati geçersiz." };
  if (s === null) return { hata: "Bitiş saati geçersiz." };
  if (s <= b) return { hata: "Bitiş saati başlangıçtan sonra olmalı." };
  if (s - b < 15) return { hata: "Etüt en az 15 dakika sürmeli." };
  if (s - b > 5 * 60) return { hata: "Etüt en fazla 5 saat sürebilir." };
  return { baslangic, bitis, dakika: s - b };
}

/** `YYYY-MM-DD` metnini yerel saat diliminden bağımsız okur. */
function tariheCevir(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 31 Şubat gibi girdileri ele: Date normalize eder, geri dönüşte eşleşmez.
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

const isoGun = (d: Date) => d.toISOString().slice(0, 10);

/** 1 = Pazartesi … 7 = Pazar (ISO). */
export function haftaninGunu(iso: string): number | null {
  const d = tariheCevir(iso);
  if (!d) return null;
  const g = d.getUTCDay(); // 0 = Pazar
  return g === 0 ? 7 : g;
}

/**
 * Haftalık tekrar tarihlerini üretir.
 *
 * Başlangıç tarihinin içinde bulunduğu haftadan itibaren, seçilen günlerde,
 * `haftaSayisi` hafta boyunca. Başlangıç tarihinden ÖNCEKİ günler atlanır —
 * salı başlayan bir seri o haftanın pazartesisini üretmez.
 */
export function haftalikTarihler(
  baslangicTarihi: string,
  gunler: number[],
  haftaSayisi: number,
): string[] {
  const bas = tariheCevir(baslangicTarihi);
  if (!bas || !gunler.length || haftaSayisi < 1) return [];

  const secili = [...new Set(gunler)].filter((g) => g >= 1 && g <= 7).sort((a, b) => a - b);
  if (!secili.length) return [];

  // Başlangıç tarihinin haftasının pazartesisi
  const basGun = bas.getUTCDay() === 0 ? 7 : bas.getUTCDay();
  const pazartesi = new Date(bas);
  pazartesi.setUTCDate(pazartesi.getUTCDate() - (basGun - 1));

  const tarihler: string[] = [];
  for (let h = 0; h < haftaSayisi; h++) {
    for (const g of secili) {
      const d = new Date(pazartesi);
      d.setUTCDate(d.getUTCDate() + h * 7 + (g - 1));
      if (d >= bas) tarihler.push(isoGun(d));
    }
  }
  return tarihler;
}

/**
 * Birebir etüdün kontenjanı tanımı gereği 1'dir; sorulması gereken bir soru
 * değil.
 *
 * NEDEN ADA BAKIYORUZ: `etut_types` tablosunda `ad` ve `aktif` dışında bir
 * alan yok — türün "tek kişilik" olduğunu söyleyen bir bayrak bulunmuyor.
 * Şablona sütun eklemek yerine ada bakmak tercih edildi.
 *
 * KABUL EDİLEN SINIR: okul türü "Bireysel Ders" diye yeniden adlandırırsa bu
 * kural çalışmaz ve kimse uyarı görmez. O yüzden liste TEK BİR YERDE duruyor;
 * düzeltmesi aşağıya bir satır eklemek.
 *
 * Türkçe küçültme şart: `"BİREBİR".toLowerCase()` İngilizce kurallarla
 * "bi̇rebi̇r" üretir ve eşleşme tutmaz.
 */
const BIREBIR_ADLARI = ["birebir", "bire bir", "bire-bir", "bireysel"];

export function birebirMi(turAdi: string | null | undefined): boolean {
  if (!turAdi) return false;
  const temiz = turAdi.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  return BIREBIR_ADLARI.includes(temiz);
}

/**
 * Sınıf etüdünde kontenjan elle girilmez: seçilen sınıfların mevcudu kadardır.
 * Öğrenciler de otomatik atanır (bkz. sinif_etudu_ogrencileri_ata).
 *
 * Birebir + sınıf etüdü birleşimi BURADA çözülmez, çağıran tarafından
 * reddedilir (`birebirSinifEtuduCakismasi`). Burada 1 döndürmek işe yaramazdı:
 * `sinif_etudu_ogrencileri_ata` kontenjanı atanan öğrenci sayısına yeniden
 * eşitliyor, yani veritabanı bu değeri hemen eziyor. Sessizce ezilen bir kural
 * yerine açık bir hata mesajı doğru.
 */
export function kontenjanHesapla(
  sinifEtudu: boolean,
  elleGirilen: number,
  seciliSiniflarinMevcudu: number,
  turAdi?: string | null,
): number {
  if (sinifEtudu) return Math.max(seciliSiniflarinMevcudu, 1);
  return birebirMi(turAdi) ? 1 : elleGirilen;
}

/** Çelişen iki seçim; hata metni null ise çelişki yok. */
export function birebirSinifEtuduCakismasi(
  turAdi: string | null | undefined,
  sinifEtudu: boolean,
): string | null {
  if (birebirMi(turAdi) && sinifEtudu) {
    return "Birebir etüt sınıf etüdü olamaz: biri tek öğrenci, diğeri tüm sınıf demek.";
  }
  return null;
}

/** Bir tarihin bugüne göre konumu — listeleri gruplamak için. */
export type Donem = "gecmis" | "bugun" | "buHafta" | "gelecekHafta" | "ilerisi";

export function donem(tarihIso: string, bugunIso: string): Donem {
  const t = tariheCevir(tarihIso);
  const b = tariheCevir(bugunIso);
  if (!t || !b) return "ilerisi";
  if (tarihIso === bugunIso) return "bugun";
  if (t < b) return "gecmis";

  const bGun = b.getUTCDay() === 0 ? 7 : b.getUTCDay();
  const buPazartesi = new Date(b);
  buPazartesi.setUTCDate(buPazartesi.getUTCDate() - (bGun - 1));
  const gelecekPazartesi = new Date(buPazartesi);
  gelecekPazartesi.setUTCDate(gelecekPazartesi.getUTCDate() + 7);
  const sonrakiPazartesi = new Date(gelecekPazartesi);
  sonrakiPazartesi.setUTCDate(sonrakiPazartesi.getUTCDate() + 7);

  if (t < gelecekPazartesi) return "buHafta";
  if (t < sonrakiPazartesi) return "gelecekHafta";
  return "ilerisi";
}

/** Okulun saat dilimindeki bugünün tarihi (YYYY-MM-DD). */
export function bugun(zamanDilimi = "Europe/Istanbul"): string {
  // en-CA biçimi zaten YYYY-MM-DD üretir.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zamanDilimi,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const TR_AY = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** "2026-07-02" → "2 Temmuz, Perşembe" */
export function tarihiYaz(iso: string): string {
  const d = tariheCevir(iso);
  if (!d) return iso;
  const gun = HAFTA_GUNLERI[(haftaninGunu(iso) ?? 1) - 1];
  return `${d.getUTCDate()} ${TR_AY[d.getUTCMonth()]}, ${gun.ad}`;
}

/** "16:00:00" → "16:00" */
export function saatiYaz(saat: string): string {
  return saat.slice(0, 5);
}

/**
 * Sınava kalan gün sayısı.
 *
 * İki tarih de "YYYY-MM-DD" metni; `Date` üzerinden çıkarma yapmıyoruz çünkü
 * yaz saati geçişlerinde iki takvim günü arası 23 veya 25 saat sürebilir ve
 * milisaniye farkını 86.400.000'e bölmek o günlerde bir gün sapma üretir.
 * UTC gece yarısı üzerinden saymak bu sapmayı tamamen ortadan kaldırır.
 *
 * Negatif değer sınavın geçtiğini gösterir; 0 "bugün" demektir.
 */
export function sinavaKalanGun(sinavTarihi: string, bugunIso: string): number {
  const gun = (t: string) =>
    Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
  return Math.round((gun(sinavTarihi) - gun(bugunIso)) / 86_400_000);
}

/** Geri sayımın ekranda yazacağı metin; sınav geçmişse null. */
export function geriSayimMetni(kalan: number): string | null {
  if (kalan < 0) return null;
  if (kalan === 0) return "Bugün!";
  if (kalan === 1) return "Yarın";
  return `${kalan} gün`;
}
