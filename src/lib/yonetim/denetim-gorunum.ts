/**
 * Denetim kaydı görünümü — istemciye de giden saf kısım.
 *
 * `islem` alanı "varlık.eylem" biçiminde teknik bir anahtar. Ekranda okunabilir
 * olması gerekiyor ama anahtarın kendisi de kaybolmamalı: destek konuşmasında
 * "etut.onayla" aranabilir bir terim.
 */

export interface DenetimSatiri {
  id: string;
  islem: string;
  entity: string;
  entityId: string | null;
  aktor: string | null;
  oncesi: Record<string, unknown> | null;
  sonrasi: Record<string, unknown> | null;
  createdAt: string;
}

const ISLEM_ADI: Record<string, string> = {
  "etut.onayla": "Etüt onaylandı",
  "etut.reddet": "Etüt reddedildi",
  "etut.duzenle": "Etüt düzenlendi",
  "yoklama.al": "Yoklama alındı",
  "yoklama.duzelt": "Yoklama düzeltildi",
  "degerlendirme.kaydet": "Değerlendirme kaydedildi",
  "ayarlar.guncelle": "Ayarlar değiştirildi",
  "kullanici.davet_kodu_yenile": "Şifre sıfırlandı",
  "kullanici.durum": "Hesap durumu değiştirildi",
  "ice_aktarim.uygula": "Excel verisi aktarıldı",
};

export function islemAdi(islem: string): string {
  return ISLEM_ADI[islem] ?? islem;
}

/** Gövdeyi şişirmeden "neyin değiştiğini" özetler. */
export function degisimOzeti(satir: DenetimSatiri): string[] {
  const { oncesi, sonrasi } = satir;
  if (!sonrasi) return [];

  const anahtarlar = new Set([...Object.keys(oncesi ?? {}), ...Object.keys(sonrasi)]);
  const satirlar: string[] = [];

  for (const k of anahtarlar) {
    // Kaydın kendi zaman damgası bir "değişiklik" sayılmaz.
    if (k === "updated_at") continue;
    const a = oncesi?.[k];
    const b = sonrasi[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    satirlar.push(`${k}: ${bicimle(a)} → ${bicimle(b)}`);
  }
  return satirlar;
}

function bicimle(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "açık" : "kapalı";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function zamanBicimle(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
