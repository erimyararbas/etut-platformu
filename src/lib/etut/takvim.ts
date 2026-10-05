/**
 * Aylık takvim ızgarasının saf mantığı.
 *
 * Tarihler HER YERDE "YYYY-MM-DD" metni olarak taşınır ve `Date` nesnesine
 * çevrilmez. Sebep: etüt tarihi okulun saat diliminde (Europe/Istanbul) bir
 * TAKVİM GÜNÜDÜR, bir zaman anı değil. `new Date("2026-09-18")` bunu UTC gece
 * yarısı sayar; tarayıcısı UTC+3'te olan öğrenci için doğru çalışır ama
 * UTC-5'teki biri için etüt bir gün geriye kayar. Metin üzerinde çalışmak bu
 * sınıf hatayı tamamen ortadan kaldırır.
 */

export interface TakvimGunu {
  /** "YYYY-MM-DD" */
  tarih: string;
  gun: number;
  /** Izgarayı doldurmak için gösterilen komşu ay günü. */
  ayDisi: boolean;
}

export const GUN_BASLIKLARI = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const AY_ADLARI = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function ikiHane(n: number): string {
  return String(n).padStart(2, "0");
}

export function tarihMetni(yil: number, ay1: number, gun: number): string {
  return `${yil}-${ikiHane(ay1)}-${ikiHane(gun)}`;
}

export function ayinGunSayisi(yil: number, ay1: number): number {
  // Date.UTC ile: yerel saat diliminden bağımsız, yalnızca takvim aritmetiği.
  return new Date(Date.UTC(yil, ay1, 0)).getUTCDate();
}

/** Ayın 1'i haftanın kaçıncı günü (0 = Pazartesi ... 6 = Pazar). */
export function ayinIlkGunuIndex(yil: number, ay1: number): number {
  const pazarSifir = new Date(Date.UTC(yil, ay1 - 1, 1)).getUTCDay();
  return (pazarSifir + 6) % 7;
}

/**
 * Pazartesi başlayan, tam haftalardan oluşan ızgara. Önceki ve sonraki ayın
 * günleriyle doldurulur ki hücreler kaymasın.
 */
export function ayIzgarasi(yil: number, ay1: number): TakvimGunu[] {
  const gunler: TakvimGunu[] = [];
  const oncekiAy = ay1 === 1 ? 12 : ay1 - 1;
  const oncekiYil = ay1 === 1 ? yil - 1 : yil;
  const sonrakiAy = ay1 === 12 ? 1 : ay1 + 1;
  const sonrakiYil = ay1 === 12 ? yil + 1 : yil;

  const bosluk = ayinIlkGunuIndex(yil, ay1);
  const oncekiGunSayisi = ayinGunSayisi(oncekiYil, oncekiAy);
  for (let i = bosluk - 1; i >= 0; i--) {
    const g = oncekiGunSayisi - i;
    gunler.push({ tarih: tarihMetni(oncekiYil, oncekiAy, g), gun: g, ayDisi: true });
  }

  const gunSayisi = ayinGunSayisi(yil, ay1);
  for (let g = 1; g <= gunSayisi; g++) {
    gunler.push({ tarih: tarihMetni(yil, ay1, g), gun: g, ayDisi: false });
  }

  // Son haftayı tamamla.
  let g = 1;
  while (gunler.length % 7 !== 0) {
    gunler.push({ tarih: tarihMetni(sonrakiYil, sonrakiAy, g), gun: g, ayDisi: true });
    g++;
  }

  return gunler;
}

export function oncekiAy(yil: number, ay1: number): { yil: number; ay: number } {
  return ay1 === 1 ? { yil: yil - 1, ay: 12 } : { yil, ay: ay1 - 1 };
}

export function sonrakiAy(yil: number, ay1: number): { yil: number; ay: number } {
  return ay1 === 12 ? { yil: yil + 1, ay: 1 } : { yil, ay: ay1 + 1 };
}

/** "YYYY-MM-DD" → { yil, ay }. */
export function ayiCoz(tarih: string): { yil: number; ay: number } {
  return { yil: Number(tarih.slice(0, 4)), ay: Number(tarih.slice(5, 7)) };
}

/**
 * Tarihe göre gruplar. Takvim hücresi yalnızca kendi gününe bakar; her hücrede
 * listeyi baştan taramak ayın 30 hücresi için 30 tarama demekti.
 */
export function gunlereGore<T extends { tarih: string; baslangic?: string }>(
  kayitlar: T[],
): Map<string, T[]> {
  const harita = new Map<string, T[]>();
  for (const k of kayitlar) {
    const mevcut = harita.get(k.tarih);
    if (mevcut) mevcut.push(k);
    else harita.set(k.tarih, [k]);
  }
  // Gün içinde saate göre: "HH:MM" metni sıralaması saat sıralamasıyla aynıdır.
  for (const liste of harita.values()) {
    liste.sort((a, b) => (a.baslangic ?? "").localeCompare(b.baslangic ?? ""));
  }
  return harita;
}

export function baslikMetni(yil: number, ay1: number): string {
  return `${AY_ADLARI[ay1 - 1]} ${yil}`;
}

/**
 * Bir tarihe gün ekler/çıkarır. Yine metin üzerinde: `Date` nesnesi yerel saat
 * dilimine bağlı olduğu için yaz saati geçişlerinde gün kayması üretebilir.
 */
export function gunEkle(tarih: string, gun: number): string {
  const d = new Date(
    Date.UTC(
      Number(tarih.slice(0, 4)),
      Number(tarih.slice(5, 7)) - 1,
      Number(tarih.slice(8, 10)) + gun,
    ),
  );
  return tarihMetni(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Tarihin içinde bulunduğu haftanın Pazartesi'si. */
export function haftaBasi(tarih: string): string {
  const pazarSifir = new Date(
    Date.UTC(
      Number(tarih.slice(0, 4)),
      Number(tarih.slice(5, 7)) - 1,
      Number(tarih.slice(8, 10)),
    ),
  ).getUTCDay();
  return gunEkle(tarih, -((pazarSifir + 6) % 7));
}

/** Tarihin haftasının Pazartesi'den Pazar'a 7 günü. */
export function haftaGunleri(tarih: string): string[] {
  const bas = haftaBasi(tarih);
  return Array.from({ length: 7 }, (_, i) => gunEkle(bas, i));
}

/** "16–22 Eylül 2026" · ay veya yıl değişiyorsa ikisini de yazar. */
export function haftaBasligi(gunler: string[]): string {
  const ilk = gunler[0];
  const son = gunler[gunler.length - 1];
  const g = (t: string) => Number(t.slice(8, 10));
  const ay = (t: string) => AY_ADLARI[Number(t.slice(5, 7)) - 1];
  const yil = (t: string) => t.slice(0, 4);

  if (yil(ilk) !== yil(son)) {
    return `${g(ilk)} ${ay(ilk)} ${yil(ilk)} – ${g(son)} ${ay(son)} ${yil(son)}`;
  }
  if (ay(ilk) !== ay(son)) {
    return `${g(ilk)} ${ay(ilk)} – ${g(son)} ${ay(son)} ${yil(son)}`;
  }
  return `${g(ilk)}–${g(son)} ${ay(son)} ${yil(son)}`;
}
