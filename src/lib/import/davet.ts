/**
 * İlk giriş davet kodları.
 *
 * Excel'den gelen kullanıcı için tek kullanımlık bir kod üretilir. Kodun kendisi
 * VERİTABANINDA SAKLANMAZ — yalnızca SHA-256 özeti saklanır. Kod tek seferliktir:
 * kullanıcı şifresini belirlediğinde özet silinir.
 *
 * Yönetici kodları listeden .xlsx olarak dışa aktarıp okula dağıtır. SMS kanalı
 * devreye alındığında aynı kod SMS ile gönderilebilir.
 */

import crypto from "node:crypto";

/**
 * Karışması kolay harf ve rakamlar çıkarıldı: I, O, 0, 1.
 * Kodlar elle yazıldığı için bu önemli.
 */
const ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UZUNLUK = 8;

/** Örnek çıktı: "K7MP-3XRA" */
export function davetKoduUret(): string {
  const harfler: string[] = [];
  for (let i = 0; i < UZUNLUK; i++) {
    harfler.push(ALFABE[crypto.randomInt(ALFABE.length)]);
  }
  return `${harfler.slice(0, 4).join("")}-${harfler.slice(4).join("")}`;
}

/** Karşılaştırma için kodu normalize eder: tire ve boşluk yok, büyük harf. */
export function davetKoduNormalize(kod: string): string {
  return kod.replace(/[\s-]/g, "").toUpperCase();
}

export function davetKoduOzeti(kod: string): string {
  return crypto.createHash("sha256").update(davetKoduNormalize(kod)).digest("hex");
}

/**
 * Sabit süreli karşılaştırma — kodu deneme yanılmayla bulmayı zorlaştırır.
 */
export function davetKoduDogrula(girilen: string, saklananOzet: string | null): boolean {
  if (!saklananOzet) return false;
  const hesaplanan = Buffer.from(davetKoduOzeti(girilen), "hex");
  const saklanan = Buffer.from(saklananOzet, "hex");
  if (hesaplanan.length !== saklanan.length) return false;
  return crypto.timingSafeEqual(hesaplanan, saklanan);
}

/** Davet kodunun geçerlilik süresi. */
export const DAVET_GECERLILIK_GUN = 30;

export function davetSonKullanma(baslangic = new Date()): Date {
  return new Date(baslangic.getTime() + DAVET_GECERLILIK_GUN * 86_400_000);
}
