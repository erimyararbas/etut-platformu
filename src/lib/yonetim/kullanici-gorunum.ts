/**
 * Kullanıcı listesinin istemciye de giden saf kısmı.
 */

export interface KullaniciSatiri {
  id: string;
  ad: string;
  soyad: string;
  eposta: string | null;
  telefon: string | null;
  okulNo: string | null;
  sinif: string | null;
  durum: "aktif" | "pasif";
  roller: string[];
  /** false ise kullanıcı davet kodunu henüz kullanmamıştır. */
  sifreBelirlendiMi: boolean;
  davetSonKullanma: string | null;
  sonGiris: string | null;
}

export const ROL_ADI: Record<string, string> = {
  ogrenci: "Öğrenci",
  ogretmen: "Öğretmen",
  veli: "Veli",
  admin: "Yönetici",
  mentor: "Mentör",
  rehber: "Rehber",
};

export type RolSuzgeci = "hepsi" | "ogrenci" | "ogretmen" | "veli" | "admin" | "girmemis";

export const ROL_SUZGECLERI: { deger: RolSuzgeci; etiket: string }[] = [
  { deger: "hepsi", etiket: "Tümü" },
  { deger: "ogrenci", etiket: "Öğrenciler" },
  { deger: "ogretmen", etiket: "Öğretmenler" },
  { deger: "veli", etiket: "Veliler" },
  { deger: "admin", etiket: "Yöneticiler" },
  { deger: "girmemis", etiket: "Henüz girmemiş" },
];

/** Türkçe arama: "İ"/"ı" ayrımı için tr-TR karşılaştırması şart. */
function kucult(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}

export function suzgecUygula(
  liste: KullaniciSatiri[],
  suzgec: RolSuzgeci,
  arama: string,
): KullaniciSatiri[] {
  const q = kucult(arama.trim());

  return liste.filter((k) => {
    const rolUygun =
      suzgec === "hepsi"
        ? true
        : suzgec === "girmemis"
          ? !k.sifreBelirlendiMi
          : suzgec === "ogretmen"
            ? k.roller.some((r) => r === "ogretmen" || r === "mentor")
            : k.roller.includes(suzgec);
    if (!rolUygun) return false;
    if (!q) return true;

    return [k.ad, k.soyad, k.eposta, k.telefon, k.okulNo, k.sinif]
      .filter((x): x is string => Boolean(x))
      .some((x) => kucult(x).includes(q));
  });
}
