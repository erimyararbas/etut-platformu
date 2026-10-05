"use client";

/**
 * Okul ayarları formu.
 *
 * Her alanın yanında sonucunu anlatan bir açıklama var: bu ekrandaki değerler
 * öğrencinin rezervasyon yapabilme anını ve öğretmenin yoklama süresini
 * belirliyor; ne yaptığı yazmazsa yanlış değer girilmesi kaçınılmaz.
 */

import { useState, useTransition } from "react";
import { GUNLER, KANALLAR, type Ayarlar, type Kanal } from "@/lib/yonetim/ayar-gorunum";
import { ayarlariKaydet } from "@/app/[okul]/yonetim/ayarlar/actions";

interface Props {
  okulSlug: string;
  baslangic: Ayarlar;
}

export function AyarFormu({ okulSlug, baslangic }: Props) {
  const [a, setA] = useState<Ayarlar>(baslangic);
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});

  const guncelle = <K extends keyof Ayarlar>(alan: K, deger: Ayarlar[K]) => {
    setA((o) => ({ ...o, [alan]: deger }));
    setSonuc({});
  };

  const kanalDegistir = (k: Kanal, acik: boolean) =>
    guncelle("kanallar", acik ? [...a.kanallar, k] : a.kanallar.filter((x) => x !== k));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        basla(async () => setSonuc(await ayarlariKaydet(okulSlug, a)));
      }}
      className="max-w-2xl space-y-4"
    >
      <Bolum
        baslik="Etüt onayı"
        aciklama="Açıkken öğretmenin oluşturduğu etüt, siz onaylayana kadar öğrencilere görünmez."
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={a.etutOnayGerekli}
            onChange={(e) => guncelle("etutOnayGerekli", e.target.checked)}
            className="mt-1 size-4"
          />
          <span className="text-sm font-semibold">
            Etütler yayına girmeden önce yönetici onayından geçsin
          </span>
        </label>

        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={a.rehberEtutOgretmenOnayi}
            onChange={(e) => guncelle("rehberEtutOgretmenOnayi", e.target.checked)}
            className="mt-1 size-4"
          />
          <span className="text-sm font-semibold">
            Rehberin bir öğretmen adına açtığı etüt, o öğretmenin onayını beklesin
            <span className="mt-0.5 block text-xs font-normal text-soluk">
              Kapalıyken etüt doğrudan açılır ve öğretmen yalnızca bildirimle
              haberdar olur.
            </span>
          </span>
        </label>
      </Bolum>

      <Bolum
        baslik="Demo girişi"
        aciklama="Tanıtım okulları içindir. Açıkken giriş ekranında rol seçerek şifresiz giriş yapılabilir."
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={a.demoModu}
            onChange={(e) => guncelle("demoModu", e.target.checked)}
            className="mt-1 size-4"
          />
          <span className="text-sm font-semibold">
            Giriş ekranında &ldquo;demo olarak incele&rdquo; seçeneği görünsün
            <span className="mt-0.5 block text-xs font-normal text-soluk">
              Gerçek öğrenci verisi bulunan bir okulda AÇMAYIN: ziyaretçiler örnek
              hesaplara şifresiz girer.
            </span>
          </span>
        </label>
      </Bolum>

      <Bolum
        baslik="Gelecek hafta rezervasyon açılışı"
        aciklama="Bu haftanın etütleri her zaman açıktır. Gelecek haftanınkiler aşağıdaki an gelince açılır."
      >
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Gün
            <select
              value={a.acilisGun}
              onChange={(e) => guncelle("acilisGun", Number(e.target.value))}
              className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
            >
              {GUNLER.map((g) => (
                <option key={g.deger} value={g.deger}>
                  {g.ad}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Saat
            <input
              type="time"
              value={a.acilisSaat}
              onChange={(e) => guncelle("acilisSaat", e.target.value)}
              className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
            />
          </label>
        </div>
      </Bolum>

      <Bolum
        baslik="Yoklama kilidi"
        aciklama="Etüt bittikten bu kadar saat sonra öğretmen yoklamayı değiştiremez. Sonrasını yalnızca yönetici düzeltebilir ve düzeltme denetim kaydına yazılır."
      >
        <label className="text-sm font-semibold">
          Saat
          <input
            type="number"
            min={1}
            max={720}
            value={a.yoklamaKilitSaat}
            onChange={(e) => guncelle("yoklamaKilitSaat", Number(e.target.value))}
            className="mt-1 block w-28 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
      </Bolum>

      <Bolum
        baslik="Sınav geri sayımı"
        aciklama="Öğrenci ana sayfasında görünür. İkisini birden boş bırakırsanız geri sayım gösterilmez."
      >
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Sınav adı
            <input
              value={a.sinavAdi}
              onChange={(e) => guncelle("sinavAdi", e.target.value)}
              placeholder="YKS 2027"
              className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            Tarih
            <input
              type="date"
              value={a.sinavTarihi}
              onChange={(e) => guncelle("sinavTarihi", e.target.value)}
              className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
            />
          </label>
        </div>
      </Bolum>

      <Bolum
        baslik="Bildirim kanalları"
        aciklama="SMS ve e-posta açıldığında bildirimler gönderim kuyruğuna düşmeye başlar. Sağlayıcı bağlanana kadar kuyrukta beklerler; hiçbir mesaj kaybolmaz."
      >
        <div className="space-y-2">
          {KANALLAR.map((k) => (
            <label key={k.deger} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={k.deger === "inapp" || a.kanallar.includes(k.deger)}
                disabled={k.deger === "inapp"}
                onChange={(e) => kanalDegistir(k.deger, e.target.checked)}
                className="mt-1 size-4"
              />
              <span className="text-sm">
                <span className="font-semibold">{k.ad}</span>
                <span className="block text-soluk">{k.aciklama}</span>
              </span>
            </label>
          ))}
        </div>
      </Bolum>

      {sonuc.hata ? (
        <div className="rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          {sonuc.hata}
        </div>
      ) : null}
      {sonuc.basari ? (
        <div className="rounded-kart border border-basarili/30 bg-basarili-acik p-3 text-sm font-semibold text-basarili">
          {sonuc.basari}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={bekliyor}
        className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-60"
      >
        {bekliyor ? "Kaydediliyor…" : "Ayarları Kaydet"}
      </button>
    </form>
  );
}

function Bolum({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-kart border border-cizgi bg-white p-4">
      <h2 className="text-sm font-bold">{baslik}</h2>
      <p className="mb-3 mt-0.5 text-sm text-soluk">{aciklama}</p>
      {children}
    </section>
  );
}
