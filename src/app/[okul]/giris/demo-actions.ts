"use server";

/**
 * Demo girişi.
 *
 * BU DOSYA KİMLİK DOĞRULAMA YAPMIYOR. Yaptığı tek şey, izin verilen bir rol
 * için giriş formunu doldurup NORMAL giriş yolunu (`girisYap`) çağırmak.
 * Okul eşleşmesi, hesabın aktifliği ve şifre kontrolü orada, herkes için
 * geçerli olan tek yerde kalıyor — demo o kontrollerin hiçbirini atlamıyor.
 *
 * Ayrı dosyada durmasının sebebi, demoya özgü İKİ KAPIYI bir arada tutmak:
 *   1. Okulun `demo_modu` ayarı açık olmalı (0031). Varsayılan KAPALI, yani
 *      yeni kurulan gerçek bir okul demoya açık doğmaz.
 *   2. Ziyaretçiden kimlik ALINMIYOR; yalnızca "hangi rol" bilgisi alınıyor
 *      ve kimliği sabit listeden sunucu seçiyor.
 *
 * Şifre `DEMO_SIFRE` ortam değişkeninden okunuyor: depoda durmuyor ve
 * ziyaretçiye hiç gösterilmiyor. Değişken tanımlı değilse demo çalışmaz.
 */

import { okulBul } from "@/lib/okul";
import { demoRolBul } from "@/lib/demo/roller";
import { girisYap, type ActionDurumu } from "./actions";

const GENEL_HATA = "Demo girişi şu anda kullanılamıyor.";

/**
 * Demo düğmesi gösterilsin mi?
 *
 * İKİ ŞART: okulun `demo_modu` ayarı açık OLACAK ve sunucuda `DEMO_SIFRE`
 * tanımlı OLACAK.
 *
 * İkincisi sadece bir güvenlik kontrolü değil, aynı zamanda görünürlük
 * kontrolü: şifre tanımlı değilken düğme çalışmaz. Görünüp de hata veren bir
 * düğme, hiç görünmeyenden kötüdür — hele ziyaretçi ürünü ilk kez görüyorsa.
 * Bu sayede yeni bir ortama (ör. önizleme dağıtımı) değişken eklenmediğinde
 * ekran kendiliğinden eski hâline dönüyor.
 *
 * Okul bilgisi `v_okullar_acik` görünümünden geliyor — giriş yapmamış
 * ziyaretçinin görebileceği okul verisi için 0004'te açılan görünüm (0032).
 * Ayrı bir SECURITY DEFINER fonksiyonu yazmak, anon'a açılan ilk fonksiyon
 * olurdu ve `test/yetki.test.ts` içindeki mutlak kuralı delerdi.
 */
export async function demoAcikMi(okulSlug: string): Promise<boolean> {
  if (!process.env.DEMO_SIFRE) return false;
  const okul = await okulBul(okulSlug);
  return okul?.demoModu === true;
}

export async function demoGiris(
  okulSlug: string,
  _oncekiDurum: ActionDurumu,
  formData: FormData,
): Promise<ActionDurumu> {
  const rol = demoRolBul(String(formData.get("rol") ?? ""));
  if (!rol) return { hata: GENEL_HATA };

  if (!(await demoAcikMi(okulSlug))) return { hata: GENEL_HATA };

  const sifre = process.env.DEMO_SIFRE;
  if (!sifre) {
    console.error("DEMO_SIFRE tanımlı değil; demo girişi kapalı.");
    return { hata: GENEL_HATA };
  }

  // Normal giriş yolunun beklediği form.
  const girisFormu = new FormData();
  girisFormu.set("kimlik", rol.kimlik);
  girisFormu.set("sifre", sifre);

  // Başarılıysa `girisYap` yönlendirme fırlatır ve buradan geri dönmez.
  const sonuc = await girisYap(okulSlug, {}, girisFormu);

  // Buraya düşüldüyse giriş tutmamıştır. Ziyaretçiye teknik ayrıntı
  // vermiyoruz; asıl neden neredeyse her zaman demo hesaplarının şifresinin
  // DEMO_SIFRE ile eşitlenmemiş olmasıdır (bkz. scripts/demo-hazirla.ts).
  if (sonuc.hata) {
    console.error("Demo girişi başarısız:", rol.anahtar, sonuc.hata);
    return { hata: GENEL_HATA };
  }
  return sonuc;
}
