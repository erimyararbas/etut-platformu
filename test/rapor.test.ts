/**
 * Katılım raporunun hesap katmanı.
 *
 * Bu sayılar veliye ve okul yönetimine gidiyor; yanlış hesaplanan bir katılım
 * yüzdesi öğrenci hakkında yanlış karar verdirir. Buradaki testlerin çoğu tam
 * olarak "mazeretli nasıl sayılır" sorusunun etrafında.
 */

import { describe, it, expect } from "vitest";
import {
  dosyaAdi,
  ogrenciOzetleri,
  type KatilimSatiri,
} from "@/lib/rapor/katilim-ozet";

const satir = (
  okulNo: string,
  durum: KatilimSatiri["durum"],
  ek: Partial<KatilimSatiri> = {},
): KatilimSatiri => ({
  okulNo,
  ad: "Ad",
  soyad: `Soyad${okulNo}`,
  sinif: "11-A",
  tarih: "2026-09-17",
  baslangic: "16:00",
  bitis: "17:00",
  ders: "Matematik",
  tur: "Soru Çözümü",
  ogretmen: "Ahmet Yılmaz",
  derslik: "B-204",
  durum,
  yildiz: null,
  yorum: null,
  ...ek,
});

describe("ogrenciOzetleri", () => {
  it("boş listeden boş özet üretir", () => {
    expect(ogrenciOzetleri([])).toEqual([]);
  });

  it("öğrenci başına durumları sayar", () => {
    const o = ogrenciOzetleri([
      satir("200", "katildi"),
      satir("200", "katildi"),
      satir("200", "devamsiz"),
      satir("201", "mazeretli"),
    ]);

    expect(o).toHaveLength(2);
    const ilk = o.find((x) => x.okulNo === "200")!;
    expect(ilk.toplam).toBe(3);
    expect(ilk.katildi).toBe(2);
    expect(ilk.devamsiz).toBe(1);
    expect(ilk.mazeretli).toBe(0);
  });

  it("katılım yüzdesini mazeretliyi paydaya koymadan hesaplar", () => {
    // 2 katıldı, 1 devamsız, 5 mazeretli → mazeretli sayılsaydı %25 olurdu.
    const satirlar = [
      satir("200", "katildi"),
      satir("200", "katildi"),
      satir("200", "devamsiz"),
      ...Array.from({ length: 5 }, () => satir("200", "mazeretli")),
    ];
    expect(ogrenciOzetleri(satirlar)[0].katilimYuzdesi).toBe(67);
  });

  it("yalnızca mazeretli kaydı olan öğrencide yüzde null döner", () => {
    const o = ogrenciOzetleri([satir("200", "mazeretli"), satir("200", "mazeretli")]);
    expect(o[0].katilimYuzdesi).toBeNull();
    expect(o[0].mazeretli).toBe(2);
  });

  it("tam katılımı 100, hiç katılmamayı 0 verir", () => {
    expect(ogrenciOzetleri([satir("200", "katildi")])[0].katilimYuzdesi).toBe(100);
    expect(ogrenciOzetleri([satir("201", "devamsiz")])[0].katilimYuzdesi).toBe(0);
  });

  it("ortalama yıldızı bir ondalığa yuvarlar, değerlendirilmemişi saymaz", () => {
    const o = ogrenciOzetleri([
      satir("200", "katildi", { yildiz: 5 }),
      satir("200", "katildi", { yildiz: 4 }),
      satir("200", "katildi", { yildiz: null }),
    ]);
    expect(o[0].ortalamaYildiz).toBe(4.5);
  });

  it("hiç değerlendirme yoksa ortalama null", () => {
    expect(ogrenciOzetleri([satir("200", "katildi")])[0].ortalamaYildiz).toBeNull();
  });

  it("sınıfa sonra ada göre sıralar", () => {
    const o = ogrenciOzetleri([
      satir("300", "katildi", { sinif: "12-A", soyad: "Zorlu" }),
      satir("200", "katildi", { sinif: "11-A", soyad: "Yılmaz" }),
      satir("201", "katildi", { sinif: "11-A", soyad: "Arslan" }),
    ]);
    expect(o.map((x) => x.okulNo)).toEqual(["201", "200", "300"]);
  });

  it("sınıfsız öğrenciyi düşürmez", () => {
    const o = ogrenciOzetleri([satir("999", "katildi", { sinif: null })]);
    expect(o).toHaveLength(1);
    expect(o[0].sinif).toBeNull();
  });
});

describe("dosyaAdi", () => {
  it("tarih aralığını dosya adına yazar", () => {
    expect(dosyaAdi("2026-09-01", "2026-09-30")).toBe("katilim-2026-09-01_2026-09-30.xlsx");
  });
});
