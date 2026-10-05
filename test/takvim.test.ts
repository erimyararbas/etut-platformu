/**
 * Aylık takvim ızgarası — saf tarih aritmetiği.
 *
 * Buradaki testlerin çoğu tek bir hataya karşı: tarihi `Date` nesnesine çevirip
 * yerel saat diliminde yorumlamak. Etüt tarihi okulun takvim günüdür; UTC
 * kayması öğrencinin etüdünü bir gün öteye taşır.
 */

import { describe, it, expect } from "vitest";
import {
  ayIzgarasi,
  ayinGunSayisi,
  ayinIlkGunuIndex,
  ayiCoz,
  baslikMetni,
  gunEkle,
  gunlereGore,
  haftaBasi,
  haftaBasligi,
  haftaGunleri,
  oncekiAy,
  sonrakiAy,
  tarihMetni,
} from "@/lib/etut/takvim";

describe("ayinGunSayisi", () => {
  it("normal ayları sayar", () => {
    expect(ayinGunSayisi(2026, 1)).toBe(31);
    expect(ayinGunSayisi(2026, 4)).toBe(30);
    expect(ayinGunSayisi(2026, 9)).toBe(30);
  });

  it("artık yılı doğru sayar", () => {
    expect(ayinGunSayisi(2026, 2)).toBe(28);
    expect(ayinGunSayisi(2028, 2)).toBe(29);
    // 1900 artık yıl DEĞİL, 2000 artık yıl.
    expect(ayinGunSayisi(1900, 2)).toBe(28);
    expect(ayinGunSayisi(2000, 2)).toBe(29);
  });
});

describe("ayinIlkGunuIndex", () => {
  it("Pazartesi 0, Pazar 6 olacak şekilde döner", () => {
    // 1 Eylül 2026 = Salı
    expect(ayinIlkGunuIndex(2026, 9)).toBe(1);
    // 1 Şubat 2026 = Pazar
    expect(ayinIlkGunuIndex(2026, 2)).toBe(6);
    // 1 Haziran 2026 = Pazartesi
    expect(ayinIlkGunuIndex(2026, 6)).toBe(0);
  });
});

describe("ayIzgarasi", () => {
  it("tam haftalardan oluşur", () => {
    for (const ay of [1, 2, 6, 9, 12]) {
      expect(ayIzgarasi(2026, ay).length % 7).toBe(0);
    }
  });

  it("ayın günlerini eksiksiz ve sırayla içerir", () => {
    const izgara = ayIzgarasi(2026, 9);
    const ayIci = izgara.filter((g) => !g.ayDisi);
    expect(ayIci).toHaveLength(30);
    expect(ayIci[0].tarih).toBe("2026-09-01");
    expect(ayIci[29].tarih).toBe("2026-09-30");
  });

  it("baştaki boşluğu önceki ayın günleriyle doldurur", () => {
    // Eylül 2026 Salı başlar → önünde 1 gün (31 Ağustos) olmalı.
    const izgara = ayIzgarasi(2026, 9);
    expect(izgara[0]).toEqual({ tarih: "2026-08-31", gun: 31, ayDisi: true });
  });

  it("yıl sınırını aşar", () => {
    const ocak = ayIzgarasi(2026, 1);
    expect(ocak[0].tarih.startsWith("2025-12")).toBe(true);

    const aralik = ayIzgarasi(2026, 12);
    expect(aralik[aralik.length - 1].tarih.startsWith("2027-01")).toBe(true);
  });

  it("Pazartesi başlayan ayda baştan boşluk bırakmaz", () => {
    const izgara = ayIzgarasi(2026, 6);
    expect(izgara[0]).toEqual({ tarih: "2026-06-01", gun: 1, ayDisi: false });
  });
});

describe("ay gezinmesi", () => {
  it("yıl sınırında dönüş yapar", () => {
    expect(oncekiAy(2026, 1)).toEqual({ yil: 2025, ay: 12 });
    expect(sonrakiAy(2026, 12)).toEqual({ yil: 2027, ay: 1 });
    expect(oncekiAy(2026, 5)).toEqual({ yil: 2026, ay: 4 });
    expect(sonrakiAy(2026, 5)).toEqual({ yil: 2026, ay: 6 });
  });
});

describe("tarihMetni ve ayiCoz", () => {
  it("tek haneli ay ve günü sıfırla doldurur", () => {
    expect(tarihMetni(2026, 1, 5)).toBe("2026-01-05");
  });

  it("birbirinin tersidir", () => {
    expect(ayiCoz(tarihMetni(2026, 9, 18))).toEqual({ yil: 2026, ay: 9 });
  });
});

describe("gunlereGore", () => {
  it("tarihe göre gruplar ve saate göre sıralar", () => {
    const kayitlar = [
      { tarih: "2026-09-18", baslangic: "16:00", id: "b" },
      { tarih: "2026-09-17", baslangic: "09:00", id: "a" },
      { tarih: "2026-09-18", baslangic: "08:00", id: "c" },
    ];
    const harita = gunlereGore(kayitlar);
    expect(harita.get("2026-09-18")?.map((x) => x.id)).toEqual(["c", "b"]);
    expect(harita.get("2026-09-17")?.map((x) => x.id)).toEqual(["a"]);
    expect(harita.get("2026-09-19")).toBeUndefined();
  });

  it("boş liste boş harita verir", () => {
    expect(gunlereGore([]).size).toBe(0);
  });
});

describe("baslikMetni", () => {
  it("Türkçe ay adını kullanır", () => {
    expect(baslikMetni(2026, 9)).toBe("Eylül 2026");
    expect(baslikMetni(2026, 1)).toBe("Ocak 2026");
  });
});

describe("gunEkle", () => {
  it("ileri ve geri gider", () => {
    expect(gunEkle("2026-09-17", 1)).toBe("2026-09-18");
    expect(gunEkle("2026-09-17", -1)).toBe("2026-09-16");
    expect(gunEkle("2026-09-17", 7)).toBe("2026-09-24");
  });

  it("ay, yıl ve artık gün sınırlarını aşar", () => {
    expect(gunEkle("2026-09-30", 1)).toBe("2026-10-01");
    expect(gunEkle("2026-12-31", 1)).toBe("2027-01-01");
    expect(gunEkle("2027-01-01", -1)).toBe("2026-12-31");
    expect(gunEkle("2028-02-28", 1)).toBe("2028-02-29");
    expect(gunEkle("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("yaz saati geçiş haftalarında gün kaydırmaz", () => {
    expect(gunEkle("2026-03-29", 1)).toBe("2026-03-30");
    expect(gunEkle("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("haftaBasi / haftaGunleri", () => {
  it("haftayı Pazartesi'den başlatır", () => {
    // 17 Eylül 2026 Perşembe → hafta başı 14 Eylül Pazartesi
    expect(haftaBasi("2026-09-17")).toBe("2026-09-14");
    // Pazar, BİR ÖNCEKİ Pazartesi'nin haftasına aittir
    expect(haftaBasi("2026-09-20")).toBe("2026-09-14");
    // Pazartesi'nin kendisi değişmez
    expect(haftaBasi("2026-09-14")).toBe("2026-09-14");
  });

  it("yedi ardışık gün döndürür", () => {
    const g = haftaGunleri("2026-09-17");
    expect(g).toHaveLength(7);
    expect(g[0]).toBe("2026-09-14");
    expect(g[6]).toBe("2026-09-20");
  });

  it("ay sınırını aşan haftayı doğru kurar", () => {
    const g = haftaGunleri("2026-10-01");
    expect(g[0]).toBe("2026-09-28");
    expect(g[6]).toBe("2026-10-04");
  });
});

describe("haftaBasligi", () => {
  it("aynı ay içindeki haftayı kısa yazar", () => {
    expect(haftaBasligi(haftaGunleri("2026-09-17"))).toBe("14–20 Eylül 2026");
  });

  it("ay değişiyorsa iki ayı da yazar", () => {
    expect(haftaBasligi(haftaGunleri("2026-10-01"))).toBe("28 Eylül – 4 Ekim 2026");
  });

  it("yıl değişiyorsa iki yılı da yazar", () => {
    expect(haftaBasligi(haftaGunleri("2026-12-31"))).toBe("28 Aralık 2026 – 3 Ocak 2027");
  });
});
