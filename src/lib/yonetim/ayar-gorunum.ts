/**
 * Okul ayarlarının istemciye de giden saf kısmı: tipler ve doğrulama şeması.
 *
 * Şema hem formda (anında geri bildirim) hem Server Action'da (asıl kontrol)
 * kullanılır. Tek yerde durması, ikisinin birbirinden ayrışmasını engeller.
 */

import { z } from "zod";

export type Kanal = "inapp" | "sms" | "eposta";

export interface Ayarlar {
  etutOnayGerekli: boolean;
  /** Rehberin bir öğretmen adına açtığı etüt, öğretmen onaylayana kadar beklesin mi? (0029) */
  rehberEtutOgretmenOnayi: boolean;
  /** Giriş ekranında "demo olarak incele" görünsün mü? (0031) */
  demoModu: boolean;
  /** 1 = Pazartesi ... 7 = Pazar */
  acilisGun: number;
  /** "HH:MM" */
  acilisSaat: string;
  yoklamaKilitSaat: number;
  sinavAdi: string;
  /** "YYYY-MM-DD" veya boş */
  sinavTarihi: string;
  kanallar: Kanal[];
}

export const GUNLER: { deger: number; ad: string }[] = [
  { deger: 1, ad: "Pazartesi" },
  { deger: 2, ad: "Salı" },
  { deger: 3, ad: "Çarşamba" },
  { deger: 4, ad: "Perşembe" },
  { deger: 5, ad: "Cuma" },
  { deger: 6, ad: "Cumartesi" },
  { deger: 7, ad: "Pazar" },
];

export const KANALLAR: { deger: Kanal; ad: string; aciklama: string }[] = [
  {
    deger: "inapp",
    ad: "Uygulama içi",
    aciklama: "Her zaman açıktır; bildirim merkezinde görünür.",
  },
  {
    deger: "sms",
    ad: "SMS",
    aciklama: "Sağlayıcı bağlanana kadar kuyrukta bekler, gönderilmez.",
  },
  {
    deger: "eposta",
    ad: "E-posta",
    aciklama: "Sağlayıcı bağlanana kadar kuyrukta bekler, gönderilmez.",
  },
];

export const ayarSemasi = z
  .object({
    etutOnayGerekli: z.boolean(),
    rehberEtutOgretmenOnayi: z.boolean(),
    demoModu: z.boolean(),
    acilisGun: z.coerce.number().int().min(1, "Gün seçin").max(7, "Gün seçin"),
    acilisSaat: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat SS:DD biçiminde olmalı"),
    // Veritabanındaki CHECK ile aynı aralık: 1–720 saat (30 gün).
    yoklamaKilitSaat: z.coerce
      .number()
      .int()
      .min(1, "En az 1 saat")
      .max(720, "En fazla 720 saat (30 gün)"),
    sinavAdi: z.string().max(120, "Sınav adı çok uzun").default(""),
    sinavTarihi: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih geçersiz")
      .or(z.literal(""))
      .default(""),
    kanallar: z.array(z.enum(["inapp", "sms", "eposta"])).default(["inapp"]),
  })
  .refine((a) => !a.sinavAdi || a.sinavTarihi, {
    message: "Sınav adı girdiyseniz tarihini de girin.",
    path: ["sinavTarihi"],
  })
  .refine((a) => !a.sinavTarihi || a.sinavAdi, {
    message: "Sınav tarihi girdiyseniz adını da girin.",
    path: ["sinavAdi"],
  });

export type AyarGirdisi = z.infer<typeof ayarSemasi>;
