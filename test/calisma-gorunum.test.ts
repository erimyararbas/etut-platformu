/**
 * Çalışma takibinin saf hesapları.
 *
 * Seri (streak) testleri gün sınırına odaklı: öğrenci sabah uygulamayı açtığında
 * henüz çalışmamış olur ve serisinin durduğunu görmemeli.
 */

import { describe, it, expect } from "vitest";
import {
  gunlukSeri,
  haftalikOzet,
  hedefYuzdesi,
  kisaTarih,
  kalanSoruMetni,
  net,
  seriUzunlugu,
  sureMetni,
  toplamSoru,
  type CalismaOturumu,
} from "@/lib/calisma/gorunum";

const oturum = (gun: string, d = 0, y = 0, b = 0, sure = 0): CalismaOturumu => ({
  id: gun + d + y + b,
  goalId: null,
  ders: "Matematik",
  konu: null,
  dogru: d,
  yanlis: y,
  bos: b,
  sureSaniye: sure,
  calismaGunu: gun,
  acikMi: false,
  not: null,
});

describe("net", () => {
  it("prototipteki formülü uygular", () => {
    expect(net(9, 2)).toBe(8.5);
    expect(net(12, 0)).toBe(12);
    expect(net(0, 0)).toBe(0);
  });

  it("yanlış doğrudan çoksa negatif olabilir", () => {
    expect(net(0, 4)).toBe(-1);
  });

  it("çeyrek netleri korur", () => {
    expect(net(10, 1)).toBe(9.75);
    expect(net(10, 3)).toBe(9.25);
  });
});

describe("toplamSoru", () => {
  it("boşları da sayar", () => {
    expect(toplamSoru({ dogru: 9, yanlis: 2, bos: 1 })).toBe(12);
  });
});

describe("seriUzunlugu", () => {
  const BUGUN = "2026-09-17";

  it("hiç çalışma yoksa sıfır", () => {
    expect(seriUzunlugu([], BUGUN)).toBe(0);
  });

  it("bugün çalışıldıysa bugünden geriye sayar", () => {
    expect(
      seriUzunlugu(["2026-09-17", "2026-09-16", "2026-09-15"], BUGUN),
    ).toBe(3);
  });

  it("bugün henüz çalışılmadıysa seri dünden devam eder", () => {
    // Sabahın erken saati: öğrenci serisini kaybetmiş görmemeli.
    expect(seriUzunlugu(["2026-09-16", "2026-09-15", "2026-09-14"], BUGUN)).toBe(3);
  });

  it("iki gün önce kesilmişse seri bitmiştir", () => {
    expect(seriUzunlugu(["2026-09-15", "2026-09-14"], BUGUN)).toBe(0);
  });

  it("arada boş gün varsa yalnızca kesintisiz kısmı sayar", () => {
    expect(
      seriUzunlugu(["2026-09-17", "2026-09-16", "2026-09-14", "2026-09-13"], BUGUN),
    ).toBe(2);
  });

  it("aynı gün birden çok kayıt seriyi şişirmez", () => {
    expect(seriUzunlugu(["2026-09-17", "2026-09-17", "2026-09-16"], BUGUN)).toBe(2);
  });

  it("ay ve yıl sınırını aşar", () => {
    expect(seriUzunlugu(["2026-10-01", "2026-09-30", "2026-09-29"], "2026-10-01")).toBe(3);
    expect(seriUzunlugu(["2027-01-01", "2026-12-31"], "2027-01-01")).toBe(2);
  });

  it("tek günlük seri de seridir", () => {
    expect(seriUzunlugu([BUGUN], BUGUN)).toBe(1);
  });
});

describe("haftalikOzet", () => {
  const oturumlar = [
    oturum("2026-09-14", 9, 2, 1, 3600),
    oturum("2026-09-16", 5, 4, 0, 1800),
    // Aralığın dışında — sayılmamalı.
    oturum("2026-09-21", 100, 0, 0, 99999),
    oturum("2026-09-13", 50, 0, 0, 99999),
  ];

  it("yalnızca aralıktaki oturumları toplar", () => {
    const o = haftalikOzet(oturumlar, "2026-09-14", "2026-09-20");
    expect(o.soru).toBe(21);
    expect(o.sureSaniye).toBe(5400);
  });

  it("neti tüm aralığın doğru/yanlışından hesaplar, oturum netlerini toplamaz", () => {
    // 14 doğru, 6 yanlış → 14 − 1.5 = 12.5
    expect(haftalikOzet(oturumlar, "2026-09-14", "2026-09-20").net).toBe(12.5);
  });

  it("aralık sınırları dahildir", () => {
    expect(haftalikOzet(oturumlar, "2026-09-14", "2026-09-14").soru).toBe(12);
  });

  it("boş aralık sıfır döner", () => {
    const o = haftalikOzet(oturumlar, "2026-09-01", "2026-09-05");
    expect(o).toEqual({ soru: 0, net: 0, sureSaniye: 0 });
  });

  it("süresi girilmemiş oturum toplamı bozmaz", () => {
    const o = haftalikOzet([{ ...oturum("2026-09-15", 1), sureSaniye: null }], "2026-09-14", "2026-09-20");
    expect(o.sureSaniye).toBe(0);
    expect(o.soru).toBe(1);
  });
});

describe("sureMetni", () => {
  it("saat ve dakikayı birlikte yazar", () => {
    expect(sureMetni(4 * 3600 + 12 * 60)).toBe("4s 12dk");
  });

  it("tam saati sade yazar", () => {
    expect(sureMetni(3600)).toBe("1s");
  });

  it("bir saatin altını yalnızca dakikayla yazar", () => {
    expect(sureMetni(12 * 60)).toBe("12dk");
  });

  it("çalışma yoksa tire gösterir", () => {
    expect(sureMetni(0)).toBe("—");
    expect(sureMetni(-5)).toBe("—");
  });

  it("bir dakikanın altını sıfır dakika sayar", () => {
    expect(sureMetni(30)).toBe("0dk");
  });
});

describe("hedef ilerlemesi", () => {
  it("yüzdeyi hesaplar", () => {
    expect(hedefYuzdesi({ cozulen: 12, hedefSoru: 30 })).toBe(40);
    expect(hedefYuzdesi({ cozulen: 0, hedefSoru: 30 })).toBe(0);
  });

  it("hedefi aşan ilerleme %100'de kalır", () => {
    expect(hedefYuzdesi({ cozulen: 45, hedefSoru: 30 })).toBe(100);
  });

  it("kalan soruyu yazar, hedef dolunca susar", () => {
    expect(kalanSoruMetni({ cozulen: 12, hedefSoru: 30 })).toBe("18 soru kaldı");
    expect(kalanSoruMetni({ cozulen: 30, hedefSoru: 30 })).toBeNull();
    expect(kalanSoruMetni({ cozulen: 45, hedefSoru: 30 })).toBeNull();
  });
});

describe("gunlukSeri", () => {
  const BITIS = "2026-09-17";

  it("istenen gün sayısı kadar kayıt döner", () => {
    expect(gunlukSeri([], BITIS, 14)).toHaveLength(14);
    expect(gunlukSeri([], BITIS, 7)).toHaveLength(7);
  });

  it("çalışılmayan günleri sıfırla doldurur — boşluklar görünsün", () => {
    const seri = gunlukSeri([oturum("2026-09-17", 5)], BITIS, 3);
    expect(seri.map((g) => g.tarih)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(seri.map((g) => g.soru)).toEqual([0, 0, 5]);
  });

  it("eskiden yeniye sıralar, son gün bitiş tarihidir", () => {
    const seri = gunlukSeri([], BITIS, 5);
    expect(seri[0].tarih).toBe("2026-09-13");
    expect(seri[4].tarih).toBe(BITIS);
  });

  it("aynı gündeki birden çok oturumu toplar", () => {
    const seri = gunlukSeri(
      [oturum("2026-09-17", 5, 1, 0, 600), oturum("2026-09-17", 3, 2, 1, 300)],
      BITIS,
      1,
    );
    expect(seri[0].soru).toBe(12);
    expect(seri[0].dogru).toBe(8);
    expect(seri[0].sureSaniye).toBe(900);
  });

  it("neti günün toplamından hesaplar", () => {
    const seri = gunlukSeri([oturum("2026-09-17", 9, 2, 1)], BITIS, 1);
    expect(seri[0].net).toBe(8.5);
  });

  it("açık sayacı grafiğe katmaz", () => {
    const acik = { ...oturum("2026-09-17", 9, 2), acikMi: true };
    expect(gunlukSeri([acik], BITIS, 1)[0].soru).toBe(0);
  });

  it("pencerenin dışındaki oturumu almaz", () => {
    const seri = gunlukSeri([oturum("2026-08-01", 50)], BITIS, 14);
    expect(seri.every((g) => g.soru === 0)).toBe(true);
  });

  it("ay sınırını aşan pencereyi doğru kurar", () => {
    const seri = gunlukSeri([], "2026-10-02", 4);
    expect(seri.map((g) => g.tarih)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("kisaTarih", () => {
  it("Türkçe kısa ay adı kullanır", () => {
    expect(kisaTarih("2026-09-17")).toBe("17 Eyl");
    expect(kisaTarih("2026-01-05")).toBe("5 Oca");
    expect(kisaTarih("2026-12-31")).toBe("31 Ara");
  });
});
