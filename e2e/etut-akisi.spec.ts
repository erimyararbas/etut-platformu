/**
 * Çekirdek etüt akışının uçtan uca testi.
 *
 * Kapsanan zincir: öğretmen etüt açar → yönetici onaylar → birinci öğrenci
 * kaydolur → kontenjan dolduğu için ikincisi sıraya girer → birincisi
 * kaydını bırakır → İKİNCİ ÖĞRENCİ OTOMATİK YÜKSELTİLİR ve bildirim alır.
 *
 * Bu son adım bilerek merkeze alındı: bekleme listesinden yükseltme
 * veritabanı fonksiyonunun içinde olup bitiyor, uygulama katmanı görmüyor.
 * Geçmişte tam da burada sessiz bir hata çıktı (PL/pgSQL'de FOUND'un
 * beklenmedik yerde sıfırlanması) ve bekleyen öğrenciler kayboldu. Birim
 * testleri bunu yakalıyor, ama arayüzün doğru durumu GÖSTERDİĞİNİ yalnızca
 * böyle bir test doğrulayabilir.
 */

import { test, expect, type Page } from "@playwright/test";
import { okulKur, okuluSil, gunSonra, SIFRE, type TestOkulu } from "./okul-kur";

let okul: TestOkulu;
let etutTarihi: string;

test.beforeAll(async () => {
  okul = await okulKur();
  // Bu haftanın ilerisi: rezervasyon penceresi bugünden itibaren açık.
  etutTarihi = gunSonra(2);
});

test.afterAll(async () => {
  if (okul) await okuluSil(okul);
});

async function girisYap(sayfa: Page, kimlik: string, sifre = SIFRE) {
  await sayfa.goto(`/${okul.slug}/giris`);
  await sayfa.getByLabel(/Okul No/i).fill(kimlik);
  await sayfa.getByLabel(/^Şifre$/i).fill(sifre);
  await sayfa.getByRole("button", { name: /Giriş Yap/i }).click();
  await expect(sayfa.getByRole("button", { name: "Çıkış" })).toBeVisible();
}

test("etüt açılır, onaylanır, dolunca sıraya girilir ve boşalınca sıradaki alınır", async ({
  browser,
}) => {
  // --- 1. Öğretmen etüdü açar ---
  const ogretmen = await browser.newPage();
  await girisYap(ogretmen, okul.ogretmenEposta);
  await ogretmen.goto(`/${okul.slug}/ogretmen/olustur`);

  await ogretmen.locator('[name="tarih"]').fill(etutTarihi);
  await ogretmen.locator('[name="baslangic"]').selectOption("15:00");
  await ogretmen.locator('[name="aciklama"]').fill("Uçtan uca test etüdü");
  // Etüt türü zorunlu. Seçilmezse tarayıcı formu hiç göndermez ve ekranda
  // hiçbir hata çıkmaz — testin ilk sürümü tam burada sessizce takıldı.
  await ogretmen.locator('[name="turId"]').selectOption({ label: "Soru Çözümü" });
  // Kontenjan 1: ikinci öğrencinin sıraya girmesi için şart.
  await ogretmen.locator('[name="kontenjan"]').fill("1");

  // Kutucuk biçimlendirilmiş bir etiketin altında kalıyor; doğrudan tıklanamaz
  // ve kullanıcı da zaten etikete tıklıyor. Sonucu girdi üzerinden doğruluyoruz.
  const sinifKutusu = ogretmen.locator('[name="siniflar"]').first();
  await ogretmen.locator('label:has([name="siniflar"])').first().click();
  await expect(sinifKutusu).toBeChecked();

  await ogretmen.getByRole("button", { name: "Etüdü Oluştur" }).click();

  await expect(ogretmen.getByText(/onaya gönderildi|oluşturuldu/i)).toBeVisible();

  // --- 2. Yönetici onaylar ---
  const yonetici = await browser.newPage();
  await girisYap(yonetici, okul.adminEposta);
  await yonetici.goto(`/${okul.slug}/yonetim/onaylar`);

  await expect(yonetici.getByText("Matematik").first()).toBeVisible();
  // Düğme "Düzenle ve Onayla": yönetici onaylamadan önce kontenjanı/saati
  // değiştirebiliyor, bu yüzden tek bir "Onayla" düğmesi yok.
  await yonetici.getByRole("button", { name: "Düzenle ve Onayla" }).first().click();
  // Onaylanan etüt listeden düşer; başka bekleyen olmadığı için liste boşalır.
  await expect(yonetici.getByText("Onay bekleyen etüt yok.")).toBeVisible();

  // --- 3. Birinci öğrenci kaydolur ---
  const ogrenci1 = await browser.newPage();
  await girisYap(ogrenci1, okul.ogrenci1No);
  await ogrenci1.getByRole("button", { name: "Etüde katıl" }).first().click();
  await expect(ogrenci1.getByText("Etüde kaydın alındı.")).toBeVisible();
  await expect(ogrenci1.getByText("Kayıtlısın").first()).toBeVisible();

  // --- 4. Kontenjan dolu: ikinci öğrenci sıraya girer ---
  const ogrenci2 = await browser.newPage();
  await girisYap(ogrenci2, okul.ogrenci2No);
  await ogrenci2.getByRole("button", { name: "Sıraya gir" }).first().click();
  await expect(ogrenci2.getByText(/bekleme listesinde 1\. sıradasın/i)).toBeVisible();

  // --- 5. Birinci öğrenci kaydını bırakır ---
  await ogrenci1.getByRole("button", { name: "Kaydımı iptal et" }).first().click();
  await expect(
    ogrenci1.getByText(/Boşalan yer bekleme listesindeki öğrenciye verildi/i),
  ).toBeVisible();

  // --- 6. İkinci öğrenci artık kayıtlı ---
  await ogrenci2.reload();
  await expect(ogrenci2.getByText("Kayıtlısın").first()).toBeVisible();
  await expect(ogrenci2.getByRole("button", { name: "Sıraya gir" })).toHaveCount(0);

  // --- 7. Ve bunu bildirimden öğreniyor ---
  await ogrenci2.goto(`/${okul.slug}/bildirimler`);
  await expect(
    ogrenci2.getByText("Bekleme listesinden etüde alındın"),
  ).toBeVisible();

  for (const s of [ogretmen, yonetici, ogrenci1, ogrenci2]) await s.close();
});

test("veli kendi çocuğunun panelini görür", async ({ page }) => {
  await girisYap(page, okul.veliTelefon);
  await expect(page.getByText("Birinci Öğrenci").first()).toBeVisible();
  // Veli paneli özet kutularıyla açılmalı, hata sayfasıyla değil.
  await expect(page.getByText(/Katılım|Devamsızlık/).first()).toBeVisible();
});

test("öğrenci yönetim ekranlarına giremez", async ({ page }) => {
  await girisYap(page, okul.ogrenci1No);

  // Yetkisiz rol yönetim adresine giderse kendi paneline yönlendirilir.
  await page.goto(`/${okul.slug}/yonetim/kullanicilar`);
  await expect(page).toHaveURL(new RegExp(`/${okul.slug}(/ogrenci)?/?$`));

  // Rapor indirme rotası doğrudan çağrılsa bile reddedilir.
  const yanit = await page.request.get(
    `/${okul.slug}/yonetim/raporlar/indir?baslangic=${etutTarihi}&bitis=${etutTarihi}`,
  );
  expect(yanit.status()).toBe(403);
});
