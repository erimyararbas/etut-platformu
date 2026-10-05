/**
 * Doldurulmuş örnek şablonlar üretir — okulun göndereceği dosyaların taklidi.
 *
 *   npm run ornek-veri
 *
 * Çıktı: docs/ornek-veri/*.xlsx
 *
 * Gerçek şablonlardan farkı: veri sayfası dolu gelir. Prototipteki demo okulu
 * temel alır (8 sınıf, 9 ders, 158 konu, öğretmenler, öğrenciler, veliler) ve
 * bilerek BİRKAÇ HATALI SATIR içerir — önizleme ekranının hataları gerçekten
 * yakaladığını görmek için.
 */

import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs/promises";
import {
  TEMPLATES_BY_ID,
  VARSAYILAN_ETUT_TURLERI,
  type TemplateId,
} from "../src/lib/import/templates";
import tymm from "../src/data/tymm.json";

const OUT = path.join(process.cwd(), "docs", "ornek-veri");

const SINIFLAR = ["9-A", "9-B", "10-A", "10-B", "11-A", "11-B", "12-A", "12-B"];
const seviyeOf = (kod: string) => `${kod.split("-")[0]}. Sınıf`;

const OGRETMENLER = [
  ["Ahmet", "Yılmaz", "ahmet.yilmaz", "Matematik", "Soru Çözümü, Konu Anlatımı, Birebir", "E"],
  ["Selin", "Kaya", "selin.kaya", "Kimya", "Konu Anlatımı, Soru Çözümü", "H"],
  ["Cem", "Öz", "cem.oz", "Fizik", "", "E"],
  ["Ayşe", "Tan", "ayse.tan", "Biyoloji", "Tekrar Dersi", "H"],
  ["Derya", "Ak", "derya.ak", "İngilizce", "Grup Etüdü", "E"],
  ["Murat", "Şen", "murat.sen", "Tarih", "", "H"],
];

const ADLAR = ["Elif", "Kaan", "Zeynep", "Mert", "Ada", "Burak", "Ece", "Deniz", "Naz", "Emir"];
const SOYADLAR = ["Demir", "Yıldız", "Ak", "Baran", "Çelik", "Şen", "Kaya", "Yüce", "Ay", "Yıldırım"];

function ogrenciler(): (string | number)[][] {
  const satirlar: (string | number)[][] = [];
  let no = 200;
  for (const sinif of SINIFLAR) {
    for (let i = 0; i < 5; i++) {
      const ad = ADLAR[(no + i) % ADLAR.length];
      const soyad = SOYADLAR[(no * 3 + i) % SOYADLAR.length];
      satirlar.push([
        String(no),
        ad,
        soyad,
        sinif,
        // Bir kısmına telefon, bir kısmına yok — gerçek hayatta da böyle olur.
        i % 3 === 0 ? `0535 ${100 + no} ${10 + i} ${20 + i}` : "",
        "",
        i === 0 ? "ahmet.yilmaz@ornek.k12.tr" : "",
        no % 37 === 0 ? "Pasif" : "Aktif",
      ]);
      no++;
    }
  }
  return satirlar;
}

function veliler(ogr: (string | number)[][]): (string | number)[][] {
  const satirlar: (string | number)[][] = [];
  ogr.slice(0, 20).forEach((o, i) => {
    const okulNo = String(o[0]);
    satirlar.push([
      ["Hakan", "Murat", "Serkan", "Volkan"][i % 4],
      String(o[2]),
      `0532 ${200 + i} ${30 + i} ${40 + i}`,
      "",
      okulNo,
      "Baba",
    ]);
    if (i % 3 === 0) {
      satirlar.push([
        ["Ayşe", "Fatma", "Sevgi"][i % 3],
        String(o[2]),
        `0533 ${300 + i} ${30 + i} ${40 + i}`,
        "",
        okulNo,
        "Anne",
      ]);
    }
  });
  return satirlar;
}

const VERILER: Record<TemplateId, () => (string | number)[][]> = {
  siniflar: () => SINIFLAR.map((k) => [k, seviyeOf(k), k.split("-")[1], ""]),

  dersler: () =>
    (tymm.subjects as { ders: string }[]).map((s) => [s.ders, "", "E"]),

  konular: () =>
    (tymm.subjects as { ders: string; grades: Record<string, string[]> }[]).flatMap((s) =>
      Object.entries(s.grades).flatMap(([seviye, konular]) =>
        konular.map((k, i) => [s.ders, seviye, k, i + 1]),
      ),
    ),

  derslikler: () => [
    ["B-204", "B Blok", "2", 24, "E"],
    ["B-210", "B Blok", "2", 18, "E"],
    ["C-110", "C Blok", "1", 20, "E"],
    ["A-008", "A Blok", "0", 30, "E"],
    ["B-220", "B Blok", "2", 12, "E"],
    ["D-001", "D Blok", "0", 0, "E"], // HATALI: kapasite sıfır olamaz
  ],

  etut_turleri: () => VARSAYILAN_ETUT_TURLERI.map((t) => [t, "E"]),

  ogretmenler: () => [
    ...OGRETMENLER.map(([ad, soyad, kul, brans, turler, mentor]) => [
      ad,
      soyad,
      `${kul}@ornek.k12.tr`,
      "",
      brans,
      turler,
      mentor,
      "Aktif",
    ]),
    // HATALI: böyle bir ders yok
    ["Pınar", "Yıldız", "pinar.yildiz@ornek.k12.tr", "", "Astronomi", "", "H", "Aktif"],
  ],

  ogrenciler: () => [
    ...ogrenciler(),
    // HATALI: böyle bir sınıf yok
    ["999", "Hatalı", "Kayıt", "13-Z", "", "", "", "Aktif"],
  ],

  veliler: () => veliler(ogrenciler()),
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  for (const [id, uret] of Object.entries(VERILER) as [TemplateId, () => (string | number)[][]][]) {
    const def = TEMPLATES_BY_ID[id];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(def.sheetName);
    ws.addRow(def.columns.map((c) => c.header));
    const satirlar = uret();
    for (const s of satirlar) ws.addRow(s);
    await wb.xlsx.writeFile(path.join(OUT, def.fileName));
    console.log(`${def.fileName.padEnd(26)} ${satirlar.length} satır`);
  }

  console.log(`\n→ ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
