/**
 * Demo rolleri — giriş ekranındaki "demo olarak incele" seçenekleri.
 *
 * `server-only` YOKTUR: giriş ekranı istemci bileşeni ve bu listeyi okuyor.
 * Burada gizli hiçbir şey yok: yalnızca hangi rollerin sunulduğu ve her
 * birinin hangi örnek hesapla eşleştiği.
 *
 * DEMO NASIL ÇALIŞIYOR: düğme, normal giriş yolunu (`girisYap`) çağırıyor.
 * Şifre sunucuda `DEMO_SIFRE` ortam değişkeninden okunuyor ve ziyaretçiye
 * hiç gösterilmiyor.
 *
 * İki yol bilinçli olarak SEÇİLMEDİ:
 *   - Servis anahtarıyla şifresiz oturum üretmek: kimlik doğrulamayı atlayan
 *     bir kod yolu açardı. Bir gün o fonksiyon başka bir yerden çağrılır ve
 *     herhangi bir hesaba şifresiz girilir.
 *   - Şifreyi kaynağa gömmek: depoya giren şifre, depoyu görebilen herkese
 *     giren şifredir.
 */

export type DemoRolAnahtari = "ogrenci" | "veli" | "ogretmen" | "rehber" | "yonetici";

export interface DemoRol {
  anahtar: DemoRolAnahtari;
  etiket: string;
  /** Bu rolle girince ne görüleceği — ziyaretçi seçmeden önce bilsin. */
  aciklama: string;
  /**
   * Giriş formuna yazılacak kimliğin AYNISI (okul no / telefon / e-posta).
   * Buraya auth e-postası yazılmıyor: sentetik e-posta biçimi değişirse
   * (bkz. lib/auth/kimlik.ts) demo sessizce bozulurdu.
   */
  kimlik: string;
}

/**
 * Hesaplar bilerek ÖRNEK VERİSİ DOLU olanlar: boş bir öğrenci hesabına giren
 * ziyaretçi ürünü değil, boş ekranları görür.
 */
export const DEMO_ROLLER: DemoRol[] = [
  {
    anahtar: "ogrenci",
    etiket: "Öğrenci",
    aciklama: "Etüt kaydı, haftalık çalışma planı, soru sayacı, deneme sonuçları.",
    kimlik: "220",
  },
  {
    anahtar: "veli",
    etiket: "Veli",
    aciklama: "Çocuğunun katılımı, öğretmen yorumları, denemeleri, randevu talebi.",
    kimlik: "05322003040",
  },
  {
    anahtar: "ogretmen",
    etiket: "Öğretmen",
    aciklama: "Etüt açma, yoklama, değerlendirme, öğrencilerin çalışma takibi.",
    kimlik: "ahmet.yilmaz@ornek.k12.tr",
  },
  {
    anahtar: "rehber",
    etiket: "Rehber öğretmen",
    aciklama: "Erken uyarı kuyruğu, görüşme kayıtları, denemeler, etüt talepleri.",
    kimlik: "rehber@ornek.k12.tr",
  },
  {
    anahtar: "yonetici",
    etiket: "Okul yöneticisi",
    aciklama: "Excel veri aktarımı, etüt onayları, kullanıcı yetkileri, denetim kaydı.",
    kimlik: "yonetici@ornek.k12.tr",
  },
];

export function demoRolBul(anahtar: string): DemoRol | null {
  return DEMO_ROLLER.find((r) => r.anahtar === anahtar) ?? null;
}
