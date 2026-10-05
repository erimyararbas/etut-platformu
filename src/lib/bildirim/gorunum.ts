/**
 * Bildirim görünüm katmanı — istemciye de gidebilen saf kısım.
 *
 * `sorgular.ts` "server-only" olduğu için tipler ve biçimlendirme burada durur;
 * aksi hâlde istemci bileşenleri sunucu modülünü paket içine sürükler.
 */

export type BildirimTipi =
  | "rezervasyon_alindi"
  | "siraya_girdi"
  | "siradan_gecti"
  | "sinif_etuduna_atandi"
  | "iptal_onaylandi"
  | "iptal_reddedildi"
  | "etut_onaylandi"
  | "etut_reddedildi"
  | "devamsizlik"
  | "degerlendirme"
  | "etut_iptal"
  | "hedef_atandi"
  | "soru_soruldu"
  | "soru_yanitlandi"
  // 0022 — mentör gönderileri. Bu üçü migration'da üretiliyordu ama buraya
  // hiç kaydedilmemişti: nötr tonla görünüyor ve tıklanınca hiçbir yere
  // gitmiyorlardı. Yeni tür eklerken atlanması en kolay adım burası.
  | "gonderi_bekliyor"
  | "gonderi_onaylandi"
  | "gonderi_reddedildi"
  // 0028 — haftalık çalışma planı.
  | "plan_atandi";

export interface Bildirim {
  id: string;
  tip: string;
  baslik: string;
  govde: string;
  data: Record<string, unknown>;
  okunduMu: boolean;
  createdAt: string;
}

/** Bildirim türünün görsel tonu. Bilinmeyen tür nötr görünür. */
export type Ton = "olumlu" | "olumsuz" | "uyari" | "notr";

const TONLAR: Record<string, Ton> = {
  rezervasyon_alindi: "olumlu",
  siradan_gecti: "olumlu",
  etut_onaylandi: "olumlu",
  degerlendirme: "olumlu",
  siraya_girdi: "uyari",
  sinif_etuduna_atandi: "uyari",
  iptal_reddedildi: "uyari",
  iptal_onaylandi: "notr",
  etut_reddedildi: "olumsuz",
  devamsizlik: "olumsuz",
  // 0014: iptal edilen etüt öğrencinin planını bozar.
  etut_iptal: "olumsuz",
  // 0021 — çalışma takibi olayları.
  hedef_atandi: "uyari",
  soru_soruldu: "uyari",
  soru_yanitlandi: "olumlu",
  // 0022 — mentör gönderileri.
  gonderi_bekliyor: "uyari",
  gonderi_onaylandi: "olumlu",
  gonderi_reddedildi: "olumsuz",
  // 0028 — haftalık plan.
  plan_atandi: "uyari",
};

export function ton(tip: string): Ton {
  return TONLAR[tip] ?? "notr";
}

export const TON_SINIFI: Record<Ton, string> = {
  olumlu: "bg-basarili-acik text-basarili border-basarili/25",
  olumsuz: "bg-marka-acik text-marka-koyu border-marka/25",
  uyari: "bg-uyari-acik text-uyari border-uyari/30",
  notr: "bg-lacivert-acik text-lacivert border-cizgi",
};

/** Zil rozetinde iki haneden fazlası okunmuyor. */
export function rozetMetni(sayi: number): string {
  if (sayi <= 0) return "";
  return sayi > 99 ? "99+" : String(sayi);
}

/**
 * "3 dakika önce", "dün", "12.09.2026" — listede tarihten çok tazelik önemli.
 * `simdi` dışarıdan verilebiliyor ki test saate bağlı olmasın.
 */
export function gecenSure(createdAt: string, simdi: Date = new Date()): string {
  const t = new Date(createdAt).getTime();
  const fark = Math.floor((simdi.getTime() - t) / 1000);

  if (fark < 60) return "az önce";
  if (fark < 3600) return `${Math.floor(fark / 60)} dk önce`;
  if (fark < 86400) return `${Math.floor(fark / 3600)} saat önce`;
  if (fark < 172800) return "dün";
  if (fark < 604800) return `${Math.floor(fark / 86400)} gün önce`;

  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Bildirimin işaret ettiği ekran. Şu an yalnızca rolün ana sayfasına götürür —
 * etüt derinlemesine bağlantısı (etüt kimliğiyle açılan kart) Faz 1'in takvim
 * işiyle birlikte gelecek. Bağlantı yoksa satır tıklanabilir olmamalı.
 */
export function hedefYol(okulSlug: string, rol: string, b: Bildirim): string | null {
  // Soru bildirimleri her iki rol için de aynı ekrana gider.
  if (typeof b.data?.soru_id === "string") return `/${okulSlug}/sorular`;

  // Hedef ve plan yalnızca öğrencinin çalışma ekranında anlamlı.
  if (
    (typeof b.data?.hedef_id === "string" || typeof b.data?.plan_id === "string") &&
    rol === "ogrenci"
  ) {
    return `/${okulSlug}/ogrenci/calisma`;
  }

  // Gönderiler: öğrenci kendi gönderilerini, mentör onay kuyruğunu görür.
  if (typeof b.data?.gonderi_id === "string") return `/${okulSlug}/gonderiler`;

  const etutId = b.data?.etut_id;
  if (typeof etutId !== "string") return null;

  switch (rol) {
    case "ogrenci":
      return `/${okulSlug}/ogrenci`;
    case "ogretmen":
      return `/${okulSlug}/ogretmen`;
    case "veli":
      return `/${okulSlug}/veli`;
    default:
      return null;
  }
}
