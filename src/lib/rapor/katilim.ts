/**
 * Katılım raporunun veri ve XLSX üretimi.
 *
 * Satırlar `katilim_raporu` fonksiyonundan gelir (0015) ve o fonksiyon
 * SECURITY INVOKER'dır: kimin hangi satırı göreceğine RLS karar verir, burada
 * ayrıca okul filtresi YOKTUR ve olmamalıdır.
 */

import "server-only";
import ExcelJS from "exceljs";
import { supabaseSunucu } from "@/lib/supabase/server";
import {
  DURUM_ADI,
  ogrenciOzetleri,
  type KatilimSatiri,
} from "./katilim-ozet";

export type { KatilimSatiri, OgrenciOzeti } from "./katilim-ozet";
export { ogrenciOzetleri, dosyaAdi } from "./katilim-ozet";

export async function katilimSatirlari(
  baslangic: string,
  bitis: string,
): Promise<KatilimSatiri[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.rpc("katilim_raporu", {
    p_baslangic: baslangic,
    p_bitis: bitis,
  });

  if (error) throw new Error(`Katılım raporu okunamadı: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    okulNo: r.okul_no as string,
    ad: r.ad as string,
    soyad: r.soyad as string,
    sinif: (r.sinif as string | null) ?? null,
    tarih: r.tarih as string,
    // Postgres 'time' "16:00:00" döner; raporda saniye gereksiz.
    baslangic: (r.baslangic as string).slice(0, 5),
    bitis: (r.bitis as string).slice(0, 5),
    ders: (r.ders as string | null) ?? null,
    tur: (r.tur as string | null) ?? null,
    ogretmen: (r.ogretmen as string | null) ?? null,
    derslik: (r.derslik as string | null) ?? null,
    durum: r.durum as KatilimSatiri["durum"],
    yildiz: r.yildiz === null ? null : Number(r.yildiz),
    yorum: (r.yorum as string | null) ?? null,
  }));
}

const BASLIK_DOLGU: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0E2A52" }, // lacivert
};

function basliklariBicimle(sayfa: ExcelJS.Worksheet) {
  const satir = sayfa.getRow(1);
  satir.font = { bold: true, color: { argb: "FFFFFFFF" } };
  satir.fill = BASLIK_DOLGU;
  satir.height = 20;
  // Uzun listelerde başlık kaybolmasın.
  sayfa.views = [{ state: "frozen", ySplit: 1 }];
  sayfa.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sayfa.columnCount },
  };
}

export async function katilimRaporuUret(
  okulAdi: string,
  baslangic: string,
  bitis: string,
  satirlar: KatilimSatiri[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Etüt Platformu";
  wb.created = new Date();

  // --- Özet ---
  const ozet = wb.addWorksheet("Özet");
  ozet.columns = [
    { header: "Okul No", key: "okulNo", width: 10 },
    { header: "Ad Soyad", key: "adSoyad", width: 26 },
    { header: "Sınıf", key: "sinif", width: 10 },
    { header: "Toplam Etüt", key: "toplam", width: 13 },
    { header: "Katıldı", key: "katildi", width: 10 },
    { header: "Devamsız", key: "devamsiz", width: 11 },
    { header: "Mazeretli", key: "mazeretli", width: 11 },
    { header: "Katılım %", key: "katilimYuzdesi", width: 11 },
    { header: "Ort. Yıldız", key: "ortalamaYildiz", width: 12 },
  ];

  for (const o of ogrenciOzetleri(satirlar)) {
    ozet.addRow({
      ...o,
      sinif: o.sinif ?? "—",
      // Hesaplanamayan değer boş bırakılmaz: "—" okuyana neden olmadığını sorar.
      katilimYuzdesi: o.katilimYuzdesi ?? "—",
      ortalamaYildiz: o.ortalamaYildiz ?? "—",
    });
  }
  basliklariBicimle(ozet);

  // --- Ayrıntı ---
  const ayrinti = wb.addWorksheet("Ayrıntı");
  ayrinti.columns = [
    { header: "Okul No", key: "okulNo", width: 10 },
    { header: "Ad Soyad", key: "adSoyad", width: 26 },
    { header: "Sınıf", key: "sinif", width: 10 },
    { header: "Tarih", key: "tarih", width: 12 },
    { header: "Saat", key: "saat", width: 13 },
    { header: "Ders", key: "ders", width: 18 },
    { header: "Tür", key: "tur", width: 18 },
    { header: "Öğretmen", key: "ogretmen", width: 22 },
    { header: "Derslik", key: "derslik", width: 10 },
    { header: "Durum", key: "durum", width: 12 },
    { header: "Yıldız", key: "yildiz", width: 8 },
    { header: "Yorum", key: "yorum", width: 40 },
  ];

  for (const s of satirlar) {
    ayrinti.addRow({
      okulNo: s.okulNo,
      adSoyad: `${s.ad} ${s.soyad}`,
      sinif: s.sinif ?? "—",
      tarih: s.tarih,
      saat: `${s.baslangic}–${s.bitis}`,
      ders: s.ders ?? "—",
      tur: s.tur ?? "—",
      ogretmen: s.ogretmen ?? "—",
      derslik: s.derslik ?? "—",
      durum: DURUM_ADI[s.durum],
      yildiz: s.yildiz ?? "—",
      yorum: s.yorum ?? "",
    });
  }
  basliklariBicimle(ayrinti);

  // --- Bilgi ---
  const bilgi = wb.addWorksheet("Bilgi");
  bilgi.columns = [{ width: 22 }, { width: 60 }];
  bilgi.addRows([
    ["Okul", okulAdi],
    ["Tarih aralığı", `${baslangic} – ${bitis}`],
    ["Oluşturulma", new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })],
    ["Kayıt sayısı", satirlar.length],
    [],
    ["Katılım % nasıl hesaplanır?", "Katıldı ÷ (Katıldı + Devamsız). Mazeretli devamsızlık paydaya katılmaz."],
    ["Ort. Yıldız", "Yalnızca öğretmenin değerlendirdiği etütlerin ortalaması."],
    ["—", "Hesaplanacak kayıt olmadığını gösterir."],
  ]);
  bilgi.getColumn(1).font = { bold: true };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
