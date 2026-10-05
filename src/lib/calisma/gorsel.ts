/**
 * Soru görselleri — yükleme yolu ve imzalı bağlantı.
 *
 * Kova ÖZEL (0020). Dosyaya doğrudan adresle erişilemez; görüntülemek için
 * sunucu kısa ömürlü imzalı bir bağlantı üretir ve bunu yalnızca satırı
 * görebilen kullanıcı ister — imza üretimi de aynı oturumla yapıldığından
 * Storage politikası bir kez daha devreye girer.
 */

export const KOVA = "ogrenci-gorselleri";

/** Kabul edilen türler kovadaki `allowed_mime_types` ile aynı olmalı (0020). */
export const IZINLI_TURLER = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** 8 MB — kovadaki `file_size_limit` ile aynı. */
export const EN_BUYUK_BAYT = 8 * 1024 * 1024;

/**
 * Yol düzeni: {school_id}/{student_id}/{benzersiz}.{uzanti}
 *
 * İlk iki parça Storage politikasının yetki dayanağı; değiştirilirse 0020
 * da değişmeli.
 */
export function gorselYolu(
  schoolId: string,
  ogrenciId: string,
  dosyaAdi: string,
): string {
  return `${schoolId}/${ogrenciId}/${crypto.randomUUID()}.${uzantiCikar(dosyaAdi)}`;
}

/**
 * Dosya adından uzantı.
 *
 * DİKKAT: `"fotograf".split(".").pop()` tüm adı döndürür, undefined değil —
 * noktasız bir ad "fotograf" uzantısı üretiyordu. Uzantı ancak gerçekten bir
 * nokta varsa ve sonrası makul uzunluktaysa kabul edilir.
 */
function uzantiCikar(dosyaAdi: string): string {
  const nokta = dosyaAdi.lastIndexOf(".");
  if (nokta <= 0 || nokta === dosyaAdi.length - 1) return "jpg";

  const uzanti = dosyaAdi
    .slice(nokta + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Uzantı 5 karakterden uzunsa muhtemelen uzantı değil (ör. "a.b/../c").
  return uzanti && uzanti.length <= 5 ? uzanti : "jpg";
}

export interface DosyaHatasi {
  hata: string;
}

/** Yüklemeden önceki istemci kontrolü. Asıl sınır kovada; bu sadece hızlı geri bildirim. */
export function dosyayiDogrula(dosya: { type: string; size: number }): DosyaHatasi | null {
  if (!IZINLI_TURLER.includes(dosya.type)) {
    return { hata: "Yalnızca fotoğraf yükleyebilirsin (JPG, PNG, WEBP, HEIC)." };
  }
  if (dosya.size > EN_BUYUK_BAYT) {
    return { hata: "Fotoğraf 8 MB'tan büyük olamaz." };
  }
  return null;
}
