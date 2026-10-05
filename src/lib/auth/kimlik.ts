/**
 * Giriş kimliğinin çözümlenmesi.
 *
 * Kullanıcılar tek bir alana yazar; rol buradan anlaşılır:
 *
 *   içinde @ varsa        → öğretmen / yönetici, kendi e-postasıyla girer
 *   10-11 haneli numara   → veli, telefonuyla girer
 *   diğer                 → öğrenci, okul numarasıyla girer
 *
 * Supabase Auth e-posta + şifre ile çalıştığı için her kimlik sabit bir auth
 * e-postasına çevrilir. Öğrenci ve veli için bu e-posta SENTETİKTİR: gerçek bir
 * kutu değildir, kullanıcı hiç görmez, yalnızca Auth tarafındaki sabit kimliktir.
 *
 * Çözümleme veritabanına BAKMADAN yapılır. Bunun iki faydası var: giriş
 * denemesi tek sorguya iniyor ve "bu numara kayıtlı mı" bilgisi giriş
 * ekranından sızmıyor — var olmayan kullanıcı da parola hatası alıyor.
 */

export type KimlikTuru = "eposta" | "telefon" | "okul_no";

/**
 * Giriş kimliği olmayan kullanıcılar için sabit, okul içinde benzersiz bir
 * auth e-postası üretir.
 */
export function sentetikEposta(slug: string, rol: string, kimlik: string): string {
  const temiz = kimlik.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${rol}-${temiz}@${slug}.etut.local`;
}

/** Telefon numarasını +90XXXXXXXXXX biçimine getirir; olmuyorsa null. */
export function telefonaCevir(girdi: string): string | null {
  const rakam = girdi.replace(/\D/g, "");
  let govde: string | null = null;
  if (rakam.length === 12 && rakam.startsWith("90")) govde = rakam.slice(2);
  else if (rakam.length === 11 && rakam.startsWith("0")) govde = rakam.slice(1);
  else if (rakam.length === 10) govde = rakam;
  return govde ? "+90" + govde : null;
}

export interface CozulmusKimlik {
  tur: KimlikTuru;
  /** Supabase Auth tarafındaki e-posta. */
  authEpostasi: string;
  /** Veritabanında aranacak normalize edilmiş değer. */
  normalize: string;
}

export function kimligiCoz(okulSlug: string, girdi: string): CozulmusKimlik | null {
  const temiz = girdi.trim();
  if (!temiz) return null;

  if (temiz.includes("@")) {
    const eposta = temiz.toLowerCase();
    // Çok temel bir biçim kontrolü; asıl doğrulama girişin kendisinde.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) return null;
    return { tur: "eposta", authEpostasi: eposta, normalize: eposta };
  }

  const telefon = telefonaCevir(temiz);
  if (telefon) {
    return {
      tur: "telefon",
      authEpostasi: sentetikEposta(okulSlug, "veli", telefon),
      normalize: telefon,
    };
  }

  // Geriye kalan her şey okul numarası sayılır.
  const okulNo = temiz.replace(/\s+/g, "");
  return {
    tur: "okul_no",
    authEpostasi: sentetikEposta(okulSlug, "ogrenci", okulNo),
    normalize: okulNo,
  };
}

/** Rolüne göre kullanıcının açılış sayfası. */
export function rolAnaSayfasi(okulSlug: string, roller: string[]): string {
  if (roller.includes("admin")) return `/${okulSlug}/yonetim`;
  if (roller.includes("ogretmen")) return `/${okulSlug}/ogretmen`;
  // Yalnızca rehber olan kullanıcı: kendi paneline. Bu satır olmazsa kök
  // sayfaya düşer ve panelini elle bulmak zorunda kalır.
  if (roller.includes("rehber")) return `/${okulSlug}/rehberlik`;
  if (roller.includes("veli")) return `/${okulSlug}/veli`;
  if (roller.includes("ogrenci")) return `/${okulSlug}/ogrenci`;
  return `/${okulSlug}`;
}
