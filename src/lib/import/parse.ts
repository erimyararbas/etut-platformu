/**
 * Excel şablon ayrıştırıcısı ve doğrulayıcısı.
 *
 * Saf bir katmandır: veritabanına dokunmaz. Mevcut kayıtlar ve çapraz referans
 * kümeleri dışarıdan `ImportLookups` ile verilir. Böylece tüm doğrulama mantığı
 * veritabanı olmadan test edilebilir ve önizleme ekranı kaydetmeden önce
 * tam sonucu gösterebilir.
 *
 * Çıktı iki seviyelidir:
 *   - dosya hataları  → satırlar hiç işlenmez (yanlış şablon, eksik başlık)
 *   - satır hataları  → yalnızca o satır uygulanmaz, diğerleri geçer
 * Uyarılar hiçbir şeyi engellemez, sadece önizlemede gösterilir.
 */

import ExcelJS from "exceljs";
import {
  TEMPLATES_BY_ID,
  type TemplateColumn,
  type TemplateDef,
  type TemplateId,
} from "./templates";

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type SatirIslemi = "ekle" | "guncelle" | "hata";

export interface SatirNotu {
  sutun?: string;
  mesaj: string;
}

export interface AyristirilmisSatir {
  /** Excel'deki gerçek satır numarası (başlık satırı 1'dir). */
  satirNo: number;
  /** Hücrelerin ham metni — hata mesajlarında ve denetim kaydında kullanılır. */
  ham: Record<string, string>;
  /** Normalize edilmiş değerler; veritabanına bunlar yazılır. */
  deger: Record<string, unknown>;
  /** Benzersizlik anahtarı (uniqueKey sütunlarından üretilir). */
  anahtar: string;
  islem: SatirIslemi;
  hatalar: SatirNotu[];
  uyarilar: SatirNotu[];
}

export interface AyristirmaSonucu {
  templateId: TemplateId;
  sayfaAdi: string | null;
  /** Doluysa hiçbir satır işlenmemiştir. */
  dosyaHatalari: string[];
  dosyaUyarilari: string[];
  satirlar: AyristirilmisSatir[];
  ozet: {
    toplam: number;
    ekle: number;
    guncelle: number;
    hata: number;
    uyari: number;
  };
}

export interface ImportLookups {
  /** Bu şablonun veritabanındaki mevcut kayıtlarının anahtarları (normalize). */
  mevcut: Set<string>;
  /** Çapraz referans için: hedef şablon → o şablonun referans değerleri (normalize). */
  referanslar: Partial<Record<TemplateId, Set<string>>>;
}

export const bosLookups = (): ImportLookups => ({ mevcut: new Set(), referanslar: {} });

// ---------------------------------------------------------------------------
// Normalize yardımcıları
// ---------------------------------------------------------------------------

/**
 * Karşılaştırma anahtarı. Türkçe yerel ayarıyla küçültülür ki "İngilizce" ile
 * "ingilizce" aynı kabul edilsin (varsayılan küçültme "İ" → "i̇" üretir).
 */
export function refKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** exceljs hücresini güvenle metne çevirir (formül, köprü, zengin metin dahil). */
function hucreMetni(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return hucreMetni(v.result as ExcelJS.CellValue);
    if ("error" in v) return "";
  }
  return String(value);
}

/**
 * Türk telefon numarasını +90XXXXXXXXXX biçimine getirir.
 * "0532 111 22 33", "532 111 22 33", "+90 532 111 22 33", "05321112233" kabul edilir.
 */
export function telefonNormalize(raw: string): {
  deger: string | null;
  hata?: string;
  uyari?: string;
} {
  const rakam = raw.replace(/\D/g, "");
  let govde: string;

  if (rakam.length === 12 && rakam.startsWith("90")) govde = rakam.slice(2);
  else if (rakam.length === 11 && rakam.startsWith("0")) govde = rakam.slice(1);
  else if (rakam.length === 10) govde = rakam;
  else {
    return {
      deger: null,
      hata: `Telefon numarası anlaşılamadı ("${raw}"). 05XX XXX XX XX biçiminde yazın.`,
    };
  }

  const sonuc = { deger: "+90" + govde } as { deger: string; uyari?: string };
  if (!govde.startsWith("5")) {
    sonuc.uyari = `"${raw}" bir cep telefonu gibi görünmüyor; SMS bildirimi bu numaraya ulaşmayabilir.`;
  }
  return sonuc;
}

const EPOSTA_DESENI = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------------------
// Hücre doğrulama
// ---------------------------------------------------------------------------

interface HucreSonucu {
  deger: unknown;
  hatalar: SatirNotu[];
  uyarilar: SatirNotu[];
}

function hucreDogrula(
  col: TemplateColumn,
  ham: string,
  lookups: ImportLookups,
): HucreSonucu {
  const hatalar: SatirNotu[] = [];
  const uyarilar: SatirNotu[] = [];
  const metin = ham.trim().replace(/\s+/g, " ");

  if (metin === "") {
    if (col.required) {
      hatalar.push({ sutun: col.header, mesaj: `"${col.header}" boş bırakılamaz.` });
    }
    return { deger: col.multi ? [] : null, hatalar, uyarilar };
  }

  const refSet = col.refTemplate ? lookups.referanslar[col.refTemplate] : undefined;

  // Çoklu değer (ör. "Verebileceği Etüt Türleri")
  if (col.multi) {
    const parcalar = metin
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const gecerli: string[] = [];
    for (const p of parcalar) {
      if (refSet && !refSet.has(refKey(p))) {
        hatalar.push({
          sutun: col.header,
          mesaj: `"${p}" tanımlı değil — önce ${col.refTemplate} listesine ekleyin.`,
        });
      } else {
        gecerli.push(p);
      }
    }
    if (parcalar.length !== new Set(parcalar.map(refKey)).size) {
      uyarilar.push({ sutun: col.header, mesaj: `"${col.header}" içinde tekrar eden değer var.` });
    }
    return { deger: gecerli, hatalar, uyarilar };
  }

  let deger: unknown = metin;

  switch (col.type) {
    case "enum": {
      const eslesme = col.enumValues?.find((v) => refKey(v) === refKey(metin));
      if (!eslesme) {
        hatalar.push({
          sutun: col.header,
          mesaj: `"${metin}" geçersiz. Şunlardan biri olmalı: ${col.enumValues?.join(", ")}`,
        });
      } else {
        deger = eslesme; // her zaman kanonik yazımı sakla
      }
      break;
    }

    case "number": {
      const n = Number(metin.replace(",", "."));
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        hatalar.push({ sutun: col.header, mesaj: `"${metin}" tam sayı değil.` });
      } else if (col.min !== undefined && n < col.min) {
        hatalar.push({
          sutun: col.header,
          mesaj: `"${col.header}" en az ${col.min} olmalı (girilen: ${n}).`,
        });
      } else {
        deger = n;
      }
      break;
    }

    case "phone": {
      const { deger: tel, hata, uyari } = telefonNormalize(metin);
      if (hata) hatalar.push({ sutun: col.header, mesaj: hata });
      if (uyari) uyarilar.push({ sutun: col.header, mesaj: uyari });
      deger = tel;
      break;
    }

    case "email": {
      const kucuk = metin.toLowerCase();
      if (!EPOSTA_DESENI.test(kucuk)) {
        hatalar.push({ sutun: col.header, mesaj: `"${metin}" geçerli bir e-posta değil.` });
      } else {
        deger = kucuk;
      }
      break;
    }

    case "bool": {
      const k = refKey(metin);
      if (["e", "evet", "true", "1", "var"].includes(k)) deger = true;
      else if (["h", "hayır", "hayir", "false", "0", "yok"].includes(k)) deger = false;
      else hatalar.push({ sutun: col.header, mesaj: `"${metin}" E veya H olmalı.` });
      break;
    }

    default:
      break;
  }

  // Tekil çapraz referans kontrolü
  if (refSet && hatalar.length === 0 && typeof deger === "string") {
    if (!refSet.has(refKey(deger))) {
      hatalar.push({
        sutun: col.header,
        mesaj: `"${deger}" tanımlı değil — önce ${col.refTemplate} listesini yükleyin.`,
      });
    }
  }

  return { deger, hatalar, uyarilar };
}

// ---------------------------------------------------------------------------
// Sayfa ve başlık çözümleme
// ---------------------------------------------------------------------------

const YARDIMCI_SAYFALAR = new Set(["açıklama", "aciklama", "listeler", "okuyun"]);

function veriSayfasiniBul(
  wb: ExcelJS.Workbook,
  def: TemplateDef,
): ExcelJS.Worksheet | null {
  const hedef = refKey(def.sheetName);
  const adaGore = wb.worksheets.find((ws) => refKey(ws.name) === hedef);
  if (adaGore) return adaGore;
  return wb.worksheets.find((ws) => !YARDIMCI_SAYFALAR.has(refKey(ws.name))) ?? null;
}

/** Başlık metni → sütun indeksi (1 tabanlı). */
function basliklariEsle(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const row = ws.getRow(1);
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const baslik = refKey(hucreMetni(cell.value));
    if (baslik && !map.has(baslik)) map.set(baslik, colNumber);
  });
  return map;
}

// ---------------------------------------------------------------------------
// Ana giriş noktası
// ---------------------------------------------------------------------------

export async function parseTemplate(
  data: ArrayBuffer | Buffer,
  templateId: TemplateId,
  lookups: ImportLookups = bosLookups(),
): Promise<AyristirmaSonucu> {
  const def = TEMPLATES_BY_ID[templateId];
  const sonuc: AyristirmaSonucu = {
    templateId,
    sayfaAdi: null,
    dosyaHatalari: [],
    dosyaUyarilari: [],
    satirlar: [],
    ozet: { toplam: 0, ekle: 0, guncelle: 0, hata: 0, uyari: 0 },
  };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as ArrayBuffer);
  } catch {
    sonuc.dosyaHatalari.push(
      "Dosya okunamadı. Geçerli bir .xlsx dosyası yüklediğinizden emin olun (.xls veya .csv desteklenmez).",
    );
    return sonuc;
  }

  const ws = veriSayfasiniBul(wb, def);
  if (!ws) {
    sonuc.dosyaHatalari.push("Dosyada veri sayfası bulunamadı.");
    return sonuc;
  }
  sonuc.sayfaAdi = ws.name;

  const basliklar = basliklariEsle(ws);
  if (basliklar.size === 0) {
    sonuc.dosyaHatalari.push("İlk satırda başlık bulunamadı. Şablonun başlık satırını silmeyin.");
    return sonuc;
  }

  // Sütun → indeks eşlemesi ve eksik başlık kontrolü
  const indeks = new Map<string, number>();
  const eksikZorunlu: string[] = [];
  for (const col of def.columns) {
    const i = basliklar.get(refKey(col.header));
    if (i === undefined) {
      if (col.required) eksikZorunlu.push(col.header);
    } else {
      indeks.set(col.key, i);
    }
  }

  if (eksikZorunlu.length) {
    sonuc.dosyaHatalari.push(
      `Zorunlu sütun(lar) bulunamadı: ${eksikZorunlu.join(", ")}. ` +
        `Yanlış şablonu yüklemiş olabilirsiniz — bu ekran "${def.title}" (${def.fileName}) bekliyor.`,
    );
    return sonuc;
  }

  const bilinenBasliklar = new Set(def.columns.map((c) => refKey(c.header)));
  const fazlalik = [...basliklar.keys()].filter((h) => !bilinenBasliklar.has(h));
  if (fazlalik.length) {
    sonuc.dosyaUyarilari.push(
      `Şablonda olmayan sütun(lar) yok sayıldı: ${fazlalik.join(", ")}.`,
    );
  }

  // Satırlar
  const dosyaIcindekiAnahtarlar = new Map<string, number>();

  ws.eachRow({ includeEmpty: false }, (row, satirNo) => {
    if (satirNo === 1) return;

    const ham: Record<string, string> = {};
    for (const col of def.columns) {
      const i = indeks.get(col.key);
      ham[col.key] = i === undefined ? "" : hucreMetni(row.getCell(i).value);
    }

    // Tamamen boş satırları atla (Excel sonda boş biçimli satır bırakabiliyor)
    if (def.columns.every((c) => ham[c.key].trim() === "")) return;

    const deger: Record<string, unknown> = {};
    const hatalar: SatirNotu[] = [];
    const uyarilar: SatirNotu[] = [];

    for (const col of def.columns) {
      const r = hucreDogrula(col, ham[col.key], lookups);
      deger[col.key] = r.deger;
      hatalar.push(...r.hatalar);
      uyarilar.push(...r.uyarilar);
    }

    // Benzersizlik anahtarı
    const anahtar = def.uniqueKey
      .map((k) => {
        const v = deger[k];
        return typeof v === "string" ? refKey(v) : String(v ?? "");
      })
      .join("");

    const anahtarTam = def.uniqueKey.every((k) => {
      const v = deger[k];
      return v !== null && v !== undefined && v !== "";
    });

    if (anahtarTam) {
      const oncekiSatir = dosyaIcindekiAnahtarlar.get(anahtar);
      if (oncekiSatir !== undefined) {
        hatalar.push({
          mesaj:
            `Bu satır ${oncekiSatir}. satırla aynı ` +
            `(${def.uniqueKey.map((k) => ham[k]).filter(Boolean).join(" + ")}). ` +
            `Dosya içinde tekrar eden kayıt olamaz.`,
        });
      } else {
        dosyaIcindekiAnahtarlar.set(anahtar, satirNo);
      }
    }

    const islem: SatirIslemi =
      hatalar.length > 0 ? "hata" : lookups.mevcut.has(anahtar) ? "guncelle" : "ekle";

    sonuc.satirlar.push({ satirNo, ham, deger, anahtar, islem, hatalar, uyarilar });
  });

  sonuc.ozet = {
    toplam: sonuc.satirlar.length,
    ekle: sonuc.satirlar.filter((r) => r.islem === "ekle").length,
    guncelle: sonuc.satirlar.filter((r) => r.islem === "guncelle").length,
    hata: sonuc.satirlar.filter((r) => r.islem === "hata").length,
    uyari: sonuc.satirlar.filter((r) => r.uyarilar.length > 0).length,
  };

  if (sonuc.ozet.toplam === 0) {
    sonuc.dosyaUyarilari.push("Dosyada hiç veri satırı yok.");
  }

  return sonuc;
}
