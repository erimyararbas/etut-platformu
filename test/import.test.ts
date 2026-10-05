/**
 * Excel ayrıştırıcısı testleri.
 *
 * Testler gerçek .xlsx baytları üretir (exceljs ile bellekte) ve ayrıştırıcıyı
 * dosya üzerinden çalıştırır — yani başlık eşleme, hücre türleri ve boş satır
 * davranışı da dahil olmak üzere tüm yol test edilir.
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseTemplate,
  refKey,
  telefonNormalize,
  bosLookups,
  type ImportLookups,
} from "@/lib/import/parse";
import { TEMPLATES_BY_ID, type TemplateId } from "@/lib/import/templates";

/** Verilen satırlardan, şablonun başlıklarını kullanan bir .xlsx üretir. */
async function xlsxYap(
  templateId: TemplateId,
  satirlar: (string | number | null)[][],
  opts: { basliklar?: string[]; sayfaAdi?: string } = {},
): Promise<Buffer> {
  const def = TEMPLATES_BY_ID[templateId];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sayfaAdi ?? def.sheetName);
  ws.addRow(opts.basliklar ?? def.columns.map((c) => c.header));
  for (const r of satirlar) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function lookups(over: Partial<ImportLookups> = {}): ImportLookups {
  return { ...bosLookups(), ...over };
}

const kume = (...v: string[]) => new Set(v.map(refKey));

describe("yardımcılar", () => {
  it("telefon numaralarını +90 biçimine getirir", () => {
    for (const giris of [
      "0532 111 22 33",
      "05321112233",
      "532 111 22 33",
      "+90 532 111 22 33",
      "+905321112233",
      "0 (532) 111-22-33",
    ]) {
      expect(telefonNormalize(giris).deger).toBe("+905321112233");
    }
  });

  it("anlaşılmayan telefonu reddeder", () => {
    expect(telefonNormalize("123").hata).toBeTruthy();
    expect(telefonNormalize("0532 111 22 33 44").hata).toBeTruthy();
  });

  it("cep olmayan numarayı uyarır ama reddetmez", () => {
    const r = telefonNormalize("0212 111 22 33");
    expect(r.deger).toBe("+902121112233");
    expect(r.uyari).toBeTruthy();
  });

  it("Türkçe büyük İ harfini doğru küçültür", () => {
    expect(refKey("İngilizce")).toBe(refKey("ingilizce"));
    expect(refKey("  Türk   Dili ")).toBe("türk dili");
  });
});

describe("temiz dosya", () => {
  it("geçerli satırları 'ekle' olarak işaretler", async () => {
    const buf = await xlsxYap("siniflar", [
      ["11-A", "11. Sınıf", "A", "Sayısal"],
      ["11-B", "11. Sınıf", "B", ""],
      ["12-A", "12. Sınıf", "A", ""],
    ]);
    const r = await parseTemplate(buf, "siniflar");
    expect(r.dosyaHatalari).toEqual([]);
    expect(r.ozet).toMatchObject({ toplam: 3, ekle: 3, guncelle: 0, hata: 0 });
    expect(r.satirlar[0].deger.sinif_kodu).toBe("11-A");
    expect(r.satirlar[0].satirNo).toBe(2);
  });

  it("mevcut kayıtları 'guncelle' olarak işaretler", async () => {
    const buf = await xlsxYap("siniflar", [
      ["11-A", "11. Sınıf", "A", "Sayısal"],
      ["12-C", "12. Sınıf", "C", ""],
    ]);
    const r = await parseTemplate(buf, "siniflar", lookups({ mevcut: kume("11-a") }));
    expect(r.ozet).toMatchObject({ toplam: 2, ekle: 1, guncelle: 1, hata: 0 });
    expect(r.satirlar[0].islem).toBe("guncelle");
    expect(r.satirlar[1].islem).toBe("ekle");
  });

  it("aradaki ve sondaki boş satırları atlar", async () => {
    const buf = await xlsxYap("siniflar", [
      ["11-A", "11. Sınıf", "A", ""],
      [null, null, null, null],
      ["11-B", "11. Sınıf", "B", ""],
      ["", "", "", ""],
    ]);
    const r = await parseTemplate(buf, "siniflar");
    expect(r.ozet.toplam).toBe(2);
  });

  it("üretilen gerçek şablon dosyasını kendi ayrıştırıcısıyla okuyabilir", async () => {
    // 03_konular_TYMM.xlsx 158 satır önceden dolu geliyor; okul hiç dokunmadan
    // yüklerse sorunsuz geçmeli.
    const def = TEMPLATES_BY_ID["konular"];
    const buf = await xlsxYap(
      "konular",
      (def.preFilled ?? []).map((row) => def.columns.map((c) => row[c.key] ?? "")),
    );
    const dersler = kume(...new Set((def.preFilled ?? []).map((r) => String(r.ders_adi))));
    const r = await parseTemplate(buf, "konular", lookups({ referanslar: { dersler } }));
    expect(r.dosyaHatalari).toEqual([]);
    expect(r.ozet.hata).toBe(0);
    expect(r.ozet.toplam).toBe(158);
  });
});

describe("satır hataları", () => {
  it("zorunlu alan boşsa hata verir, diğer satırları etkilemez", async () => {
    const buf = await xlsxYap("siniflar", [
      ["11-A", "11. Sınıf", "A", ""],
      ["", "11. Sınıf", "B", ""],
      ["12-A", "12. Sınıf", "A", ""],
    ]);
    const r = await parseTemplate(buf, "siniflar");
    expect(r.ozet).toMatchObject({ toplam: 3, ekle: 2, hata: 1 });
    const hatali = r.satirlar.find((x) => x.islem === "hata")!;
    expect(hatali.satirNo).toBe(3);
    expect(hatali.hatalar[0].mesaj).toMatch(/boş bırakılamaz/);
  });

  it("listede olmayan enum değerini reddeder ve seçenekleri gösterir", async () => {
    const buf = await xlsxYap("siniflar", [["11-A", "On birinci", "A", ""]]);
    const r = await parseTemplate(buf, "siniflar");
    expect(r.satirlar[0].islem).toBe("hata");
    expect(r.satirlar[0].hatalar[0].mesaj).toMatch(/11\. Sınıf/);
  });

  it("enum değerini büyük/küçük harf farkına rağmen kabul edip kanonikleştirir", async () => {
    const buf = await xlsxYap("siniflar", [["11-A", "11. SINIF", "A", ""]]);
    const r = await parseTemplate(buf, "siniflar");
    expect(r.satirlar[0].islem).toBe("ekle");
    expect(r.satirlar[0].deger.seviye).toBe("11. Sınıf");
  });

  it("geçersiz e-postayı reddeder", async () => {
    const buf = await xlsxYap("ogretmenler", [
      ["Ahmet", "Yılmaz", "ahmet(at)okul.tr", "", "Matematik", "", "E", "H", "Aktif"],
    ]);
    const r = await parseTemplate(
      buf,
      "ogretmenler",
      lookups({ referanslar: { dersler: kume("Matematik") } }),
    );
    expect(r.satirlar[0].hatalar.some((h) => /e-posta/i.test(h.mesaj))).toBe(true);
  });

  it("kapasiteyi sıfır veya negatif kabul etmez", async () => {
    const buf = await xlsxYap("derslikler", [
      ["B-204", "B Blok", "2", 0, "E"],
      ["C-110", "C Blok", "1", 20, "E"],
    ]);
    const r = await parseTemplate(buf, "derslikler");
    expect(r.satirlar[0].islem).toBe("hata");
    expect(r.satirlar[0].hatalar[0].mesaj).toMatch(/en az 1/);
    expect(r.satirlar[1].islem).toBe("ekle");
  });

  it("dosya içinde tekrar eden kaydı yakalar ve satır numarasını söyler", async () => {
    const buf = await xlsxYap("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["251", "Kaan", "Yıldız", "11-A", "", "", "", "Aktif"],
      ["248", "Elif", "Demir", "11-B", "", "", "", "Aktif"],
    ]);
    const r = await parseTemplate(
      buf,
      "ogrenciler",
      lookups({ referanslar: { siniflar: kume("11-A", "11-B"), ogretmenler: new Set() } }),
    );
    expect(r.ozet.hata).toBe(1);
    const hatali = r.satirlar[2];
    expect(hatali.islem).toBe("hata");
    expect(hatali.hatalar[0].mesaj).toMatch(/2\. satırla aynı/);
  });
});

describe("çapraz referanslar", () => {
  it("tanımsız sınıf koduna atıf yapan öğrenciyi reddeder", async () => {
    const buf = await xlsxYap("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
      ["300", "Ada", "Çelik", "13-Z", "", "", "", "Aktif"],
    ]);
    const r = await parseTemplate(
      buf,
      "ogrenciler",
      lookups({ referanslar: { siniflar: kume("11-A"), ogretmenler: new Set() } }),
    );
    expect(r.satirlar[0].islem).toBe("ekle");
    expect(r.satirlar[1].islem).toBe("hata");
    expect(r.satirlar[1].hatalar[0].mesaj).toMatch(/13-Z.*tanımlı değil/);
  });

  it("virgüllü çoklu değerleri tek tek doğrular", async () => {
    const buf = await xlsxYap("ogretmenler", [
      [
        "Ahmet",
        "Yılmaz",
        "ahmet@okul.tr",
        "0532 111 22 33",
        "Matematik",
        "Soru Çözümü, Birebir",
        "E",
        "H",
        "Aktif",
      ],
      [
        "Selin",
        "Kaya",
        "selin@okul.tr",
        "",
        "Matematik",
        "Soru Çözümü, Hayali Tür",
        "H",
        "H",
        "Aktif",
      ],
    ]);
    const r = await parseTemplate(
      buf,
      "ogretmenler",
      lookups({
        referanslar: {
          dersler: kume("Matematik"),
          etut_turleri: kume("Soru Çözümü", "Birebir"),
        },
      }),
    );
    expect(r.satirlar[0].islem).toBe("ekle");
    expect(r.satirlar[0].deger.verebilecegi_etut_turleri).toEqual(["Soru Çözümü", "Birebir"]);
    expect(r.satirlar[0].deger.telefon).toBe("+905321112233");
    expect(r.satirlar[1].islem).toBe("hata");
    expect(r.satirlar[1].hatalar[0].mesaj).toMatch(/Hayali Tür/);
  });

  it("isteğe bağlı referans boş bırakılabilir", async () => {
    const buf = await xlsxYap("ogrenciler", [
      ["248", "Elif", "Demir", "11-A", "", "", "", "Aktif"],
    ]);
    const r = await parseTemplate(
      buf,
      "ogrenciler",
      lookups({ referanslar: { siniflar: kume("11-A"), ogretmenler: new Set() } }),
    );
    expect(r.satirlar[0].islem).toBe("ekle");
    expect(r.satirlar[0].deger.mentor_ogretmen_eposta).toBeNull();
  });
});

describe("dosya seviyesi hatalar", () => {
  it("yanlış şablon yüklenirse satırları hiç işlemez ve doğru dosyayı söyler", async () => {
    const buf = await xlsxYap("siniflar", [["11-A", "11. Sınıf", "A", ""]]);
    const r = await parseTemplate(buf, "ogrenciler"); // öğrenci bekleyen ekrana sınıf dosyası
    expect(r.satirlar).toHaveLength(0);
    expect(r.dosyaHatalari[0]).toMatch(/Okul No/);
    expect(r.dosyaHatalari[0]).toMatch(/07_ogrenciler\.xlsx/);
  });

  it("bozuk dosyayı anlaşılır bir mesajla reddeder", async () => {
    const r = await parseTemplate(Buffer.from("bu bir excel dosyası değil"), "siniflar");
    expect(r.dosyaHatalari[0]).toMatch(/\.xlsx/);
    expect(r.satirlar).toHaveLength(0);
  });

  it("fazladan sütunu yok sayar ama uyarır", async () => {
    const def = TEMPLATES_BY_ID["siniflar"];
    const buf = await xlsxYap(
      "siniflar",
      [["11-A", "11. Sınıf", "A", "", "okulun kendi notu"]],
      { basliklar: [...def.columns.map((c) => c.header), "Notlar"] },
    );
    const r = await parseTemplate(buf, "siniflar");
    expect(r.dosyaHatalari).toEqual([]);
    expect(r.dosyaUyarilari[0]).toMatch(/notlar/i);
    expect(r.satirlar[0].islem).toBe("ekle");
  });

  it("sütun sırası değişmişse yine doğru okur", async () => {
    const buf = await xlsxYap("siniflar", [["11. Sınıf", "11-A", "Sayısal", "A"]], {
      basliklar: ["Seviye", "Sınıf Kodu", "Açıklama", "Şube"],
    });
    const r = await parseTemplate(buf, "siniflar");
    expect(r.satirlar[0].deger.sinif_kodu).toBe("11-A");
    expect(r.satirlar[0].deger.seviye).toBe("11. Sınıf");
    expect(r.satirlar[0].deger.sube).toBe("A");
  });

  it("sayfa adı değiştirilse bile veri sayfasını bulur", async () => {
    const buf = await xlsxYap("siniflar", [["11-A", "11. Sınıf", "A", ""]], {
      sayfaAdi: "Sayfa1",
    });
    const r = await parseTemplate(buf, "siniflar");
    expect(r.dosyaHatalari).toEqual([]);
    expect(r.ozet.toplam).toBe(1);
  });
});

describe("veli şablonu — bir satır bir bağ", () => {
  it("aynı veliyi iki öğrenciye bağlayabilir", async () => {
    const buf = await xlsxYap("veliler", [
      ["Hakan", "Demir", "0532 777 88 99", "", "248", "Baba"],
      ["Hakan", "Demir", "0532 777 88 99", "", "402", "Baba"],
      ["Ayşe", "Demir", "0533 111 00 22", "", "248", "Anne"],
    ]);
    const r = await parseTemplate(
      buf,
      "veliler",
      lookups({ referanslar: { ogrenciler: kume("248", "402") } }),
    );
    expect(r.ozet).toMatchObject({ toplam: 3, ekle: 3, hata: 0 });
  });

  it("aynı veli-öğrenci bağını iki kez yazmayı reddeder", async () => {
    const buf = await xlsxYap("veliler", [
      ["Hakan", "Demir", "0532 777 88 99", "", "248", "Baba"],
      ["Hakan", "Demir", "0532 777 88 99", "", "248", "Baba"],
    ]);
    const r = await parseTemplate(
      buf,
      "veliler",
      lookups({ referanslar: { ogrenciler: kume("248") } }),
    );
    expect(r.ozet.hata).toBe(1);
  });
});
