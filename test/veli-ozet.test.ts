import { describe, it, expect } from "vitest";
import { ozetHesapla, type EtutGecmisi } from "@/lib/veli/gorunum";

const etut = (o: Partial<EtutGecmisi>): EtutGecmisi => ({
  etutId: crypto.randomUUID(),
  tarih: "2026-09-10",
  baslangic: "16:00",
  bitis: "17:00",
  ders: "Matematik",
  konu: null,
  tur: "Soru Çözümü",
  derslik: null,
  ogretmen: "Ahmet Yılmaz",
  kayitDurumu: "rezerve",
  yoklama: null,
  yildiz: null,
  hazirYorumlar: [],
  yorum: null,
  ...o,
});

const BUGUN = "2026-09-15";

describe("veli özeti", () => {
  it("katılım yüzdesini yoklaması ALINMIŞ etütler üzerinden hesaplar", () => {
    const o = ozetHesapla(
      [
        etut({ yoklama: "katildi" }),
        etut({ yoklama: "katildi" }),
        etut({ yoklama: "devamsiz" }),
        // Yoklaması alınmamış iki etüt paydayı BOZMAMALI.
        etut({ yoklama: null }),
        etut({ yoklama: null }),
      ],
      BUGUN,
    );
    expect(o.yoklananEtut).toBe(3);
    expect(o.katilimYuzdesi).toBe(67);
    expect(o.devamsizlik).toBe(1);
  });

  it("hiç yoklama alınmamışsa yüzde göstermez", () => {
    // %0 yazmak veliye "çocuğum hiç gitmemiş" dedirtir; oysa yoklama alınmamıştır.
    const o = ozetHesapla([etut({}), etut({})], BUGUN);
    expect(o.katilimYuzdesi).toBeNull();
    expect(o.yoklananEtut).toBe(0);
  });

  it("mazeretli devamsızlıktan ayrı sayılır", () => {
    const o = ozetHesapla(
      [etut({ yoklama: "katildi" }), etut({ yoklama: "mazeretli" }), etut({ yoklama: "devamsiz" })],
      BUGUN,
    );
    expect(o.katilim).toBe(1);
    expect(o.mazeretli).toBe(1);
    expect(o.devamsizlik).toBe(1);
    expect(o.katilimYuzdesi).toBe(33);
  });

  it("yıldız ortalamasını bir ondalıkla verir", () => {
    const o = ozetHesapla([etut({ yildiz: 5 }), etut({ yildiz: 4 }), etut({ yildiz: 4 })], BUGUN);
    expect(o.ortalamaYildiz).toBe(4.3);
    expect(o.degerlendirmeSayisi).toBe(3);
  });

  it("değerlendirme yoksa ortalama göstermez", () => {
    expect(ozetHesapla([etut({})], BUGUN).ortalamaYildiz).toBeNull();
  });

  it("yaklaşan ve bu ayki etütleri ayırır", () => {
    const o = ozetHesapla(
      [
        etut({ tarih: "2026-09-20" }), // yaklaşan, bu ay
        etut({ tarih: "2026-09-10" }), // geçmiş, bu ay
        etut({ tarih: "2026-08-30" }), // geçen ay
      ],
      BUGUN,
    );
    expect(o.yaklasanEtut).toBe(1);
    expect(o.buAyEtut).toBe(2);
  });

  it("boş geçmişte çökmez", () => {
    const o = ozetHesapla([], BUGUN);
    expect(o).toMatchObject({
      yoklananEtut: 0,
      katilimYuzdesi: null,
      ortalamaYildiz: null,
      yaklasanEtut: 0,
    });
  });
});
