import { describe, it, expect } from "vitest";
import {
  araligiDogrula,
  birebirMi,
  birebirSinifEtuduCakismasi,
  bitisSaati,
  donem,
  geriSayimMetni,
  haftalikTarihler,
  haftaninGunu,
  kontenjanHesapla,
  saatiDakikayaCevir,
  saatSecenekleri,
  sinavaKalanGun,
  tarihiYaz,
} from "@/lib/etut/kurallar";

describe("saat aralığı", () => {
  it("geçerli aralığı süresiyle döndürür", () => {
    expect(araligiDogrula("16:00", "17:30")).toEqual({
      baslangic: "16:00",
      bitis: "17:30",
      dakika: 90,
    });
  });

  it("bitişi başlangıçtan önce veya eşit kabul etmez", () => {
    expect(araligiDogrula("17:00", "16:00")).toEqual({
      hata: "Bitiş saati başlangıçtan sonra olmalı.",
    });
    expect(araligiDogrula("16:00", "16:00")).toMatchObject({ hata: expect.any(String) });
  });

  it("çok kısa ve çok uzun etüdü reddeder", () => {
    expect(araligiDogrula("16:00", "16:10")).toMatchObject({ hata: /en az 15/ });
    expect(araligiDogrula("08:00", "14:00")).toMatchObject({ hata: /en fazla 5 saat/ });
  });

  it("geçersiz saat biçimini reddeder", () => {
    expect(araligiDogrula("25:00", "26:00")).toMatchObject({ hata: /Başlangıç/ });
    expect(saatiDakikayaCevir("16:75")).toBeNull();
    expect(saatiDakikayaCevir("abc")).toBeNull();
  });

  it("bitiş saatini süreden hesaplar", () => {
    expect(bitisSaati("16:00", 90)).toBe("17:30");
    expect(bitisSaati("23:30", 60)).toBeNull(); // ertesi güne taşamaz
  });

  it("saat listesi 15 dakikalık adımlarla üretilir", () => {
    const l = saatSecenekleri(7, 22);
    expect(l[0]).toBe("07:00");
    expect(l[1]).toBe("07:15");
    expect(l.at(-1)).toBe("22:00");
    expect(l).toContain("16:45");
  });
});

describe("haftalık tekrar tarihleri", () => {
  // 2026-07-01 Çarşamba
  it("seçilen günlerde istenen hafta kadar üretir", () => {
    // Pazartesi + Cuma, 2 hafta, çarşambadan başlayarak
    const t = haftalikTarihler("2026-07-01", [1, 5], 2);
    // İlk haftanın pazartesisi (29 Haziran) başlangıçtan ÖNCE, atlanır.
    expect(t).toEqual(["2026-07-03", "2026-07-06", "2026-07-10"]);
  });

  it("başlangıç günü de seçiliyse onu da üretir", () => {
    // 2026-07-01 Çarşamba; çarşamba seçili
    const t = haftalikTarihler("2026-07-01", [3], 3);
    expect(t).toEqual(["2026-07-01", "2026-07-08", "2026-07-15"]);
  });

  it("günleri sıraya koyar ve tekrarları teker", () => {
    expect(haftalikTarihler("2026-07-06", [5, 1, 1], 1)).toEqual([
      "2026-07-06",
      "2026-07-10",
    ]);
  });

  it("geçersiz girdide boş döner", () => {
    expect(haftalikTarihler("2026-07-01", [], 4)).toEqual([]);
    expect(haftalikTarihler("2026-07-01", [1], 0)).toEqual([]);
    expect(haftalikTarihler("gecersiz", [1], 4)).toEqual([]);
    expect(haftalikTarihler("2026-02-31", [1], 4)).toEqual([]);
  });

  it("12 haftalık dönem boyu seri doğru sayıda üretir", () => {
    // Haftada 2 gün x 12 hafta = 24 (başlangıç pazartesi, ikisi de ileride)
    expect(haftalikTarihler("2026-07-06", [1, 4], 12)).toHaveLength(24);
  });
});

describe("hafta günü ve dönem", () => {
  it("ISO hafta gününü verir (1 = Pazartesi)", () => {
    expect(haftaninGunu("2026-07-01")).toBe(3); // Çarşamba
    expect(haftaninGunu("2026-07-05")).toBe(7); // Pazar
    expect(haftaninGunu("2026-07-06")).toBe(1); // Pazartesi
  });

  it("tarihi bugüne göre konumlandırır", () => {
    const bugun = "2026-07-01"; // Çarşamba
    expect(donem("2026-07-01", bugun)).toBe("bugun");
    expect(donem("2026-06-30", bugun)).toBe("gecmis");
    expect(donem("2026-07-03", bugun)).toBe("buHafta"); // Cuma
    expect(donem("2026-07-05", bugun)).toBe("buHafta"); // Pazar — hafta pazar biter
    expect(donem("2026-07-06", bugun)).toBe("gelecekHafta"); // Pazartesi
    expect(donem("2026-07-13", bugun)).toBe("ilerisi");
  });
});

describe("kontenjan", () => {
  it("sınıf etüdünde seçilen sınıfların mevcuduna eşitlenir", () => {
    expect(kontenjanHesapla(true, 12, 27)).toBe(27);
  });

  it("sınıf etüdü değilse elle girilen değer kullanılır", () => {
    expect(kontenjanHesapla(false, 12, 27)).toBe(12);
  });

  it("boş sınıf seçiminde bile en az 1 olur (veritabanı sıfırı reddeder)", () => {
    expect(kontenjanHesapla(true, 12, 0)).toBe(1);
  });

  it("birebir etütte elle girilen değer ne olursa olsun 1'dir", () => {
    expect(kontenjanHesapla(false, 12, 0, "Birebir")).toBe(1);
    expect(kontenjanHesapla(false, 500, 0, "Birebir")).toBe(1);
  });

  it("tür birebir değilse elle girilen değere dokunmaz", () => {
    expect(kontenjanHesapla(false, 12, 0, "Soru Çözümü")).toBe(12);
    expect(kontenjanHesapla(false, 12, 0, null)).toBe(12);
  });
});

describe("birebir tür eşleşmesi", () => {
  it("büyük/küçük harf ve boşluk farkını yok sayar", () => {
    // Türkçe küçültme şart: "BİREBİR".toLowerCase() İngilizce kurallarla
    // "bi̇rebi̇r" üretir ve eşleşme tutmazdı.
    expect(birebirMi("Birebir")).toBe(true);
    expect(birebirMi("BİREBİR")).toBe(true);
    expect(birebirMi("birebir")).toBe(true);
    expect(birebirMi("  Bire Bir  ")).toBe(true);
    expect(birebirMi("bire-bir")).toBe(true);
    expect(birebirMi("Bireysel")).toBe(true);
  });

  it("başka türleri birebir saymaz", () => {
    expect(birebirMi("Soru Çözümü")).toBe(false);
    expect(birebirMi("Grup Etüdü")).toBe(false);
    expect(birebirMi("Birebir Görüşme")).toBe(false); // tam eşleşme arıyoruz
    expect(birebirMi("")).toBe(false);
    expect(birebirMi(null)).toBe(false);
    expect(birebirMi(undefined)).toBe(false);
  });
});

describe("birebir + sınıf etüdü çelişkisi", () => {
  it("ikisi birden seçilirse hata verir", () => {
    // Sessizce birini seçmek yanlış olurdu: sınıf etüdünde veritabanı
    // kontenjanı atanan öğrenci sayısına eşitliyor, yani "1" hemen eziliyor.
    expect(birebirSinifEtuduCakismasi("Birebir", true)).toMatch(/sınıf etüdü olamaz/i);
  });

  it("tek başına seçilenlerde çelişki yok", () => {
    expect(birebirSinifEtuduCakismasi("Birebir", false)).toBeNull();
    expect(birebirSinifEtuduCakismasi("Soru Çözümü", true)).toBeNull();
  });
});

describe("biçimlendirme", () => {
  it("tarihi Türkçe yazar", () => {
    expect(tarihiYaz("2026-07-02")).toBe("2 Temmuz, Perşembe");
    expect(tarihiYaz("2026-01-15")).toBe("15 Ocak, Perşembe");
  });
});

describe("sınav geri sayımı", () => {
  it("kalan günü sayar", () => {
    expect(sinavaKalanGun("2026-09-20", "2026-09-17")).toBe(3);
    expect(sinavaKalanGun("2026-09-17", "2026-09-17")).toBe(0);
    expect(sinavaKalanGun("2027-06-20", "2026-09-17")).toBe(276);
  });

  it("geçmiş sınav için negatif döner", () => {
    expect(sinavaKalanGun("2026-09-15", "2026-09-17")).toBe(-2);
  });

  it("yaz saati geçişinde sapmaz", () => {
    // Türkiye kalıcı UTC+3'te ama tarayıcı başka bir bölgede olabilir; hesap
    // UTC gece yarısı üzerinden yapıldığı için sonuç her yerde aynı olmalı.
    expect(sinavaKalanGun("2026-03-30", "2026-03-28")).toBe(2);
    expect(sinavaKalanGun("2026-10-26", "2026-10-24")).toBe(2);
  });

  it("ay ve yıl sınırını aşar", () => {
    expect(sinavaKalanGun("2027-01-01", "2026-12-31")).toBe(1);
    expect(sinavaKalanGun("2026-03-01", "2026-02-28")).toBe(1);
  });

  it("metni doğru biçimlendirir, geçmiş sınavı gizler", () => {
    expect(geriSayimMetni(0)).toBe("Bugün!");
    expect(geriSayimMetni(1)).toBe("Yarın");
    expect(geriSayimMetni(276)).toBe("276 gün");
    expect(geriSayimMetni(-1)).toBeNull();
  });
});
