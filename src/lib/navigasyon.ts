/**
 * Rol başına gezinme bağlantıları.
 *
 * Bildirimler ekranı her rolün ortak sayfası olduğu için hangi kabuğu
 * göstereceğini bilmek zorunda; bu yüzden navigasyon rol layout'larından
 * çıkarılıp tek yerde toplandı.
 */

import type { Rol, Oturum } from "@/lib/auth/oturum";
import type { NavOgesi } from "@/components/app/rol-kabugu";

/**
 * Kullanıcının ana rolü. Bir öğretmen aynı zamanda mentör olabilir; hangi
 * paneli göreceğini en yetkili rol belirler.
 */
export function anaRol(oturum: Pick<Oturum, "roller">): Rol | null {
  const sira: Rol[] = ["admin", "ogretmen", "mentor", "rehber", "veli", "ogrenci"];
  return sira.find((r) => oturum.roller.includes(r)) ?? null;
}

/** Kabuk düzeni: personel sol menüyle, öğrenci ve veli üst barla çalışır. */
export function rolDuzeni(rol: Rol | null): "kenar" | "ust" {
  return rol === "admin" || rol === "ogretmen" || rol === "mentor" || rol === "rehber"
    ? "kenar"
    : "ust";
}

/** Kenar düzeninde logonun altında yazan panel adı. */
export function panelAdi(rol: Rol | null): string | undefined {
  switch (rol) {
    case "rehber":
      return "Rehberlik Servisi";
    case "admin":
      return "Yönetim Paneli";
    case "ogretmen":
    case "mentor":
      return "Öğretmen Paneli";
    default:
      return undefined;
  }
}

export function rolEtiketi(rol: Rol | null): string | undefined {
  switch (rol) {
    case "admin":
      return "Yönetici";
    case "ogretmen":
    case "mentor":
      return "Öğretmen";
    case "rehber":
      return "Rehber";
    case "veli":
      return "Veli";
    default:
      return undefined;
  }
}

/** Rolün ana ekranı — girişten ve bildirimden sonra buraya dönülür. */
export function rolAnaYolu(okulSlug: string, rol: Rol | null): string {
  switch (rol) {
    case "admin":
      return `/${okulSlug}/yonetim`;
    case "ogretmen":
    case "mentor":
      return `/${okulSlug}/ogretmen`;
    // Saf rehber öğretmen paneline giremez (rolZorunlu "ogretmen"); oraya
    // yönlendirmek onu kapıdan geri çeviren bir döngüye sokardı.
    case "rehber":
      return `/${okulSlug}/rehberlik`;
    case "veli":
      return `/${okulSlug}/veli`;
    case "ogrenci":
      return `/${okulSlug}/ogrenci`;
    default:
      return `/${okulSlug}`;
  }
}

/**
 * @param roller kullanıcının TÜM rolleri. Ana rol paneli belirler ama bir
 * öğretmen aynı zamanda rehber olabilir; rehberlik bağlantısı o zaman da
 * görünmeli. Yalnızca ana role bakmak bu kullanıcıyı kendi panelinden ederdi.
 */
export function navigasyon(
  okulSlug: string,
  rol: Rol | null,
  roller: Rol[] = [],
): NavOgesi[] {
  const k = `/${okulSlug}`;
  const rehberlik: NavOgesi[] =
    roller.includes("rehber") && rol !== "rehber"
      ? [{ etiket: "Rehberlik", yol: `${k}/rehberlik`, kisa: "Rehber" }]
      : [];

  switch (rol) {
    case "rehber":
      return [
        { etiket: "Rehberlik", yol: `${k}/rehberlik`, kisa: "Rehber" },
        { etiket: "Sorular", yol: `${k}/sorular`, kisa: "Soru" },
      ];
    case "admin":
      return [
        { etiket: "Panel", yol: `${k}/yonetim`, kisa: "Panel" },
        { etiket: "Onaylar", yol: `${k}/yonetim/onaylar`, kisa: "Onay" },
        { etiket: "Etütler", yol: `${k}/yonetim/etutler`, kisa: "Etüt" },
        { etiket: "Kullanıcılar", yol: `${k}/yonetim/kullanicilar`, kisa: "Kişi" },
        { etiket: "Veri Aktarımı", yol: `${k}/yonetim/veri-aktarimi`, kisa: "Veri" },
        { etiket: "Akademik Yapı", yol: `${k}/yonetim/akademik`, kisa: "Yapı" },
        { etiket: "Ayarlar", yol: `${k}/yonetim/ayarlar`, kisa: "Ayar" },
        { etiket: "Raporlar", yol: `${k}/yonetim/raporlar`, kisa: "Rapor" },
        { etiket: "Denetim", yol: `${k}/yonetim/denetim`, kisa: "Denetim" },
      ];
    case "ogretmen":
    case "mentor":
      return [
        { etiket: "Etütlerim", yol: `${k}/ogretmen`, kisa: "Etütler" },
        { etiket: "Etüt Oluştur", yol: `${k}/ogretmen/olustur`, kisa: "Oluştur" },
        { etiket: "Yoklama", yol: `${k}/ogretmen/yoklama`, kisa: "Yoklama" },
        { etiket: "Öğrenci Takibi", yol: `${k}/ogretmen/calisma`, kisa: "Takip" },
        { etiket: "Sorular", yol: `${k}/sorular`, kisa: "Soru" },
        { etiket: "Mentör", yol: `${k}/gonderiler`, kisa: "Mentör" },
        ...rehberlik,
      ];
    case "veli":
      return [{ etiket: "Özet", yol: `${k}/veli`, kisa: "Özet" }];
    case "ogrenci":
      return [
        { etiket: "Etütler", yol: `${k}/ogrenci`, kisa: "Etütler" },
        { etiket: "Takvim", yol: `${k}/ogrenci/takvim`, kisa: "Takvim" },
        { etiket: "Çalışmalarım", yol: `${k}/ogrenci/calisma`, kisa: "Çalışma" },
        { etiket: "Sorular", yol: `${k}/sorular`, kisa: "Soru" },
      ];
    default:
      return [];
  }
}
