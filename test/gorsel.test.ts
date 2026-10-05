/**
 * Soru görseli yol düzeni ve dosya doğrulaması.
 *
 * YOL DÜZENİ KRİTİK: Storage politikası (0020) yetkiyi dosyanın yolundan
 * okuyor — birinci klasör okul, ikinci klasör öğrenci. Buradaki üretici
 * fonksiyon düzeni bozarsa yükleme politikaya takılır ve kullanıcı yalnızca
 * "yüklenemedi" görür; sebebi hiçbir yerde yazmaz. Bu testler tam olarak o
 * sessiz kopmayı engelliyor.
 */

import { describe, it, expect } from "vitest";
import {
  EN_BUYUK_BAYT,
  IZINLI_TURLER,
  dosyayiDogrula,
  gorselYolu,
} from "@/lib/calisma/gorsel";

const OKUL = "11111111-1111-4111-8111-111111111111";
const OGRENCI = "22222222-2222-4222-8222-222222222222";

describe("gorselYolu", () => {
  it("okul ve öğrenci klasörlerini bu sırayla kurar", () => {
    const yol = gorselYolu(OKUL, OGRENCI, "foto.jpg");
    const parcalar = yol.split("/");
    expect(parcalar).toHaveLength(3);
    expect(parcalar[0]).toBe(OKUL);
    expect(parcalar[1]).toBe(OGRENCI);
  });

  it("sunucudaki yol şemasına uyar", () => {
    // actions.ts içindeki yolSemasi ile aynı desen.
    const desen = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.[a-z0-9]+$/i;
    expect(gorselYolu(OKUL, OGRENCI, "foto.jpg")).toMatch(desen);
    expect(gorselYolu(OKUL, OGRENCI, "IMG_0042.PNG")).toMatch(desen);
    expect(gorselYolu(OKUL, OGRENCI, "tatil fotoğrafı.webp")).toMatch(desen);
  });

  it("her çağrıda benzersiz ad üretir", () => {
    const a = gorselYolu(OKUL, OGRENCI, "foto.jpg");
    const b = gorselYolu(OKUL, OGRENCI, "foto.jpg");
    expect(a).not.toBe(b);
  });

  it("uzantıyı küçültür ve tehlikeli karakterleri atar", () => {
    expect(gorselYolu(OKUL, OGRENCI, "foto.JPG").endsWith(".jpg")).toBe(true);
    expect(gorselYolu(OKUL, OGRENCI, "a.b/../c.png").endsWith(".png")).toBe(true);
  });

  it("uzantısız dosyaya varsayılan verir", () => {
    expect(gorselYolu(OKUL, OGRENCI, "fotograf").endsWith(".jpg")).toBe(true);
  });
});

describe("dosyayiDogrula", () => {
  it("izinli görsel türlerini kabul eder", () => {
    for (const tur of IZINLI_TURLER) {
      expect(dosyayiDogrula({ type: tur, size: 1000 })).toBeNull();
    }
  });

  it("görsel olmayanı reddeder", () => {
    expect(dosyayiDogrula({ type: "application/pdf", size: 1000 })?.hata).toMatch(
      /fotoğraf/i,
    );
    // Video özellikle dışarıda: ücretsiz Supabase planında 1 GB alan var.
    expect(dosyayiDogrula({ type: "video/mp4", size: 1000 })).not.toBeNull();
  });

  it("boyut sınırını uygular", () => {
    expect(dosyayiDogrula({ type: "image/jpeg", size: EN_BUYUK_BAYT })).toBeNull();
    expect(dosyayiDogrula({ type: "image/jpeg", size: EN_BUYUK_BAYT + 1 })?.hata).toMatch(
      /8 MB/,
    );
  });

  it("sınır kovadaki ayarla aynı olmalı", () => {
    // 0020'deki file_size_limit = 8388608
    expect(EN_BUYUK_BAYT).toBe(8388608);
  });
});
