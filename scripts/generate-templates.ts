/**
 * Okula gönderilecek Excel şablonlarını üretir.
 *
 *   npm run sablonlar
 *
 * Çıktı: docs/sablonlar/*.xlsx  (+ 00_OKUYUN.xlsx kapak dosyası)
 *
 * Her dosyada:
 *   - Veri sayfası: başlık satırı (donuk), açılır liste doğrulamaları, sütun genişlikleri
 *   - "Açıklama" sayfası: sütun sözlüğü, örnek satırlar, notlar
 *   - "Listeler" sayfası (gizli): açılır listelerin kaynağı
 */

import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs/promises";
import {
  TEMPLATES,
  templatesInOrder,
  type TemplateColumn,
  type TemplateDef,
} from "../src/lib/import/templates";

const OUT_DIR = path.join(process.cwd(), "docs", "sablonlar");

const INK = "FF161A20";
const BLUE = "FF0B57C2";
const NAVY = "FF0E2A52";
const RED = "FFE1241B";
const MUTED = "FF6B7280";
const LINE = "FFE7EAF0";
const TINT = "FFE8F0FC";
const BG = "FFF3F5F9";

function headerFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: LINE } };
  return { top: side, left: side, bottom: side, right: side };
}

/** Veri sayfası: başlıklar + doğrulamalar + varsa önceden dolu gerçek veri. */
function buildDataSheet(wb: ExcelJS.Workbook, def: TemplateDef) {
  const ws = wb.addWorksheet(def.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = def.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  const head = ws.getRow(1);
  head.height = 26;
  head.eachCell((cell, i) => {
    const col = def.columns[i - 1];
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = headerFill(col.required ? NAVY : BLUE);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
    cell.note = `${col.required ? "ZORUNLU" : "İsteğe bağlı"}\n\n${col.help}\n\nÖrnek: ${col.example}`;
  });

  for (const row of def.preFilled ?? []) {
    ws.addRow(def.columns.map((c) => row[c.key] ?? ""));
  }

  // Doğrulamaları başlığın altındaki geniş bir aralığa uygula ki okul satır
  // eklediğinde de geçerli olsun.
  const lastRow = Math.max(2000, (def.preFilled?.length ?? 0) + 200);
  def.columns.forEach((col, idx) => {
    const letter = ws.getColumn(idx + 1).letter;
    if (col.type === "enum" && col.enumValues) {
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: "list",
          allowBlank: !col.required,
          formulae: [`"${col.enumValues.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "error",
          errorTitle: "Geçersiz değer",
          error: `${col.header} yalnızca şunlardan biri olabilir: ${col.enumValues.join(", ")}`,
        };
      }
    }
    if (col.type === "number") {
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: "whole",
          operator: "greaterThan",
          allowBlank: !col.required,
          formulae: [0],
          showErrorMessage: true,
          errorStyle: "error",
          errorTitle: "Geçersiz sayı",
          error: `${col.header} sıfırdan büyük bir tam sayı olmalıdır.`,
        };
      }
    }
    // Telefon ve okul no metin olarak kalmalı; Excel baştaki sıfırı yemesin.
    if (col.type === "phone" || col.key === "okul_no") {
      ws.getColumn(idx + 1).numFmt = "@";
    }
  });

  return ws;
}

/** Açıklama sayfası: sütun sözlüğü + örnek satırlar + notlar. */
function buildHelpSheet(wb: ExcelJS.Workbook, def: TemplateDef) {
  const ws = wb.addWorksheet("Açıklama", {
    properties: { tabColor: { argb: BLUE } },
  });
  ws.columns = [
    { width: 30 },
    { width: 12 },
    { width: 16 },
    { width: 78 },
    { width: 34 },
  ];

  let r = 1;

  const title = ws.getRow(r++);
  title.getCell(1).value = def.title;
  title.getCell(1).font = { bold: true, size: 18, color: { argb: NAVY } };
  title.height = 28;

  const file = ws.getRow(r++);
  file.getCell(1).value = def.fileName;
  file.getCell(1).font = { size: 10, color: { argb: MUTED }, italic: true };

  r++;
  const desc = ws.getRow(r++);
  ws.mergeCells(r - 1, 1, r - 1, 5);
  desc.getCell(1).value = def.description;
  desc.getCell(1).alignment = { wrapText: true, vertical: "top" };
  desc.height = 46;

  if (def.dependsOn.length) {
    r++;
    const dep = ws.getRow(r++);
    ws.mergeCells(r - 1, 1, r - 1, 5);
    const names = def.dependsOn
      .map((id) => TEMPLATES.find((t) => t.id === id)!.fileName)
      .join(" ve ");
    dep.getCell(1).value = `ÖNCE YÜKLEYİN: ${names}`;
    dep.getCell(1).font = { bold: true, color: { argb: RED } };
    dep.getCell(1).fill = headerFill("FFFDECEA");
  }

  r += 2;
  const colHead = ws.getRow(r++);
  ["Sütun", "Zorunlu", "Tür", "Açıklama", "Örnek"].forEach((h, i) => {
    const cell = colHead.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = headerFill(NAVY);
    cell.alignment = { vertical: "middle" };
    cell.border = thinBorder();
  });
  colHead.height = 22;

  const typeLabel: Record<TemplateColumn["type"], string> = {
    text: "Metin",
    number: "Sayı",
    enum: "Listeden",
    phone: "Telefon",
    email: "E-posta",
    bool: "E / H",
  };

  for (const col of def.columns) {
    const row = ws.getRow(r++);
    row.getCell(1).value = col.header;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = col.required ? "Evet" : "Hayır";
    row.getCell(2).font = { color: { argb: col.required ? RED : MUTED }, bold: col.required };
    row.getCell(3).value = typeLabel[col.type];
    row.getCell(4).value =
      col.help +
      (col.enumValues ? `  [${col.enumValues.join(" / ")}]` : "") +
      (col.multi ? "  (virgülle birden çok değer yazılabilir)" : "");
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.getCell(5).value = col.example;
    row.getCell(5).font = { color: { argb: MUTED } };
    row.height = 32;
    for (let c = 1; c <= 5; c++) row.getCell(c).border = thinBorder();
  }

  r += 2;
  const exHead = ws.getRow(r++);
  exHead.getCell(1).value = "ÖRNEK SATIRLAR";
  exHead.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };

  const exCols = ws.getRow(r++);
  def.columns.forEach((col, i) => {
    const cell = exCols.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10 };
    cell.fill = headerFill(TINT);
    cell.border = thinBorder();
  });
  for (const ex of def.examples) {
    const row = ws.getRow(r++);
    def.columns.forEach((col, i) => {
      row.getCell(i + 1).value = ex[col.key] ?? "";
      row.getCell(i + 1).border = thinBorder();
      row.getCell(i + 1).font = { size: 10, color: { argb: INK } };
    });
  }

  if (def.notes.length) {
    r += 2;
    const nHead = ws.getRow(r++);
    nHead.getCell(1).value = "NOTLAR";
    nHead.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };
    for (const note of def.notes) {
      const row = ws.getRow(r++);
      ws.mergeCells(r - 1, 1, r - 1, 5);
      row.getCell(1).value = "•  " + note;
      row.getCell(1).alignment = { wrapText: true, vertical: "top" };
      row.height = 20;
    }
  }

  return ws;
}

async function buildTemplate(def: TemplateDef) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Etüt Platformu";
  wb.created = new Date();

  buildDataSheet(wb, def);
  buildHelpSheet(wb, def);

  const out = path.join(OUT_DIR, def.fileName);
  await wb.xlsx.writeFile(out);
  return { file: def.fileName, rows: def.preFilled?.length ?? 0 };
}

/** Okulun önce açacağı kapak dosyası: sıra, kimin doldurduğu, genel kurallar. */
async function buildReadme() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Etüt Platformu";
  const ws = wb.addWorksheet("Okuyun", { properties: { tabColor: { argb: RED } } });
  ws.columns = [{ width: 8 }, { width: 30 }, { width: 34 }, { width: 62 }, { width: 16 }];

  let r = 1;
  const t = ws.getRow(r++);
  t.getCell(1).value = "Etüt Platformu — Veri Giriş Şablonları";
  ws.mergeCells(r - 1, 1, r - 1, 5);
  t.getCell(1).font = { bold: true, size: 20, color: { argb: NAVY } };
  t.height = 32;

  const sub = ws.getRow(r++);
  ws.mergeCells(r - 1, 1, r - 1, 5);
  sub.getCell(1).value =
    "Dosyaları AŞAĞIDAKİ SIRAYLA doldurup sisteme yükleyin. Sıra önemlidir: sonraki dosyalar öncekilere referans verir.";
  sub.getCell(1).alignment = { wrapText: true, vertical: "top" };
  sub.getCell(1).font = { size: 11 };
  sub.height = 34;

  r++;
  const head = ws.getRow(r++);
  ["Sıra", "Dosya", "İçerik", "Notlar", "Önceden dolu"].forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = headerFill(NAVY);
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle" };
  });
  head.height = 24;

  for (const def of templatesInOrder()) {
    const row = ws.getRow(r++);
    row.getCell(1).value = def.order;
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).value = def.fileName;
    row.getCell(2).font = { bold: true };
    row.getCell(3).value = def.title;
    row.getCell(4).value = def.description;
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.getCell(5).value = def.preFilled?.length ? `${def.preFilled.length} satır` : "—";
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(5).font = { color: { argb: def.preFilled?.length ? BLUE : MUTED } };
    row.height = 44;
    for (let c = 1; c <= 5; c++) row.getCell(c).border = thinBorder();
  }

  r += 2;
  const rHead = ws.getRow(r++);
  rHead.getCell(1).value = "GENEL KURALLAR";
  rHead.getCell(1).font = { bold: true, size: 13, color: { argb: NAVY } };

  const rules = [
    "Başlık satırını (1. satır) DEĞİŞTİRMEYİN, silmeyin, sıralamasını bozmayın.",
    "Koyu lacivert başlıklı sütunlar ZORUNLUDUR; mavi başlıklı sütunlar isteğe bağlıdır.",
    "Her dosyanın “Açıklama” sekmesinde sütun sözlüğü, örnek satırlar ve notlar vardır.",
    "Açılır listesi olan sütunlara elle yazmayın, listeden seçin.",
    "Telefon numaralarını 05XX XXX XX XX biçiminde yazın.",
    "Bir dosyayı ikinci kez yüklemek veriyi SİLMEZ; mevcut kayıtları günceller, yenileri ekler.",
    "Yükleme öncesi sistem bir önizleme gösterir: kaç yeni, kaç güncelleme, kaç hatalı satır. Onaylamadan hiçbir şey kaydedilmez.",
    "Hatalı satırlar satır numarasıyla birlikte listelenir; düzeltip aynı dosyayı tekrar yükleyebilirsiniz.",
    "Boş satır bırakmayın; veri kesintisiz devam etmelidir.",
  ];
  for (const rule of rules) {
    const row = ws.getRow(r++);
    ws.mergeCells(r - 1, 1, r - 1, 5);
    row.getCell(1).value = "•  " + rule;
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.height = 20;
  }

  r += 2;
  const qHead = ws.getRow(r++);
  qHead.getCell(1).value = "AYRICA İHTİYACIMIZ OLAN BİLGİLER (bu dosyalarda yok, bize yazılı iletin)";
  ws.mergeCells(r - 1, 1, r - 1, 5);
  qHead.getCell(1).font = { bold: true, size: 13, color: { argb: RED } };

  const asks = [
    "Akademik yıl ve dönem başlangıç / bitiş tarihleri",
    "Sınav geri sayımında gösterilecek sınav adı ve tarihi (ör. YKS 2027 — 20 Haziran 2027)",
    "Gelecek haftanın etüt rezervasyonunun açılacağı gün ve saat (ör. Cuma 20:00)",
    "Öğretmenin açtığı etüt yayına girmeden önce yönetici onayından geçsin mi? (Evet / Hayır)",
    "Okul logosu (PNG/SVG) ve kurumsal renkler",
    "Sistem yöneticisi olacak kişinin ad soyad, e-posta ve telefonu",
  ];
  for (const ask of asks) {
    const row = ws.getRow(r++);
    ws.mergeCells(r - 1, 1, r - 1, 5);
    row.getCell(1).value = "•  " + ask;
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.height = 20;
  }

  ws.getCell("A1").fill = headerFill(BG);
  await wb.xlsx.writeFile(path.join(OUT_DIR, "00_OKUYUN.xlsx"));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await buildReadme();
  console.log("00_OKUYUN.xlsx");
  for (const def of templatesInOrder()) {
    const res = await buildTemplate(def);
    console.log(`${res.file}${res.rows ? `  (${res.rows} satır önceden dolu)` : ""}`);
  }
  console.log(`\nToplam ${TEMPLATES.length + 1} dosya → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
