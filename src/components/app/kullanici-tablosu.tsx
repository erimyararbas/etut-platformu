"use client";

/**
 * Yönetici kullanıcı listesi: rol süzgeci, arama, şifre sıfırlama.
 *
 * Süzgeç ve arama istemcide çalışır — bir okulun kullanıcı sayısı birkaç bini
 * geçmez ve her tuşta sunucuya gitmek gecikme yaratırdı. Liste bundan büyürse
 * süzgeç sunucuya taşınır.
 */

import { useMemo, useState, useTransition } from "react";
import {
  ROL_ADI,
  ROL_SUZGECLERI,
  suzgecUygula,
  type KullaniciSatiri,
  type RolSuzgeci,
} from "@/lib/yonetim/kullanici-gorunum";
import {
  davetKoduYenile,
  durumDegistir,
  rolDegistir,
} from "@/app/[okul]/yonetim/kullanicilar/actions";

/** Öğrenci ve veli hesaplarına personel rolü verilemez (bkz. rolDegistir). */
function personelMi(k: KullaniciSatiri): boolean {
  return !k.roller.includes("ogrenci") && !k.roller.includes("veli");
}

interface Props {
  okulSlug: string;
  kullanicilar: KullaniciSatiri[];
  sayilar: Record<RolSuzgeci, number>;
  /** Yöneticinin kendi kimliği — kendi hesabını kapatma butonu gizlenir. */
  kendiId: string;
}

export function KullaniciTablosu({ okulSlug, kullanicilar, sayilar, kendiId }: Props) {
  const [suzgec, setSuzgec] = useState<RolSuzgeci>("hepsi");
  const [arama, setArama] = useState("");
  const [bekliyor, basla] = useTransition();
  const [kodKutusu, setKodKutusu] = useState<{ ad: string; kod: string } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  /**
   * Yalnızca KİMLİK tutuluyor, satırın kopyası değil: rol değişince sunucu
   * listeyi tazeliyor ve panel güncel satırı buradan buluyor. Satırı
   * kopyalasaydık panel eski rolleri göstermeye devam ederdi.
   */
  const [rolKutusuId, setRolKutusuId] = useState<string | null>(null);

  const liste = useMemo(
    () => suzgecUygula(kullanicilar, suzgec, arama),
    [kullanicilar, suzgec, arama],
  );

  const rolKutusu = rolKutusuId
    ? (kullanicilar.find((k) => k.id === rolKutusuId) ?? null)
    : null;

  const rolAyarla = (kullaniciId: string, rol: "mentor" | "rehber", ver: boolean) =>
    basla(async () => {
      setHata(null);
      const s = await rolDegistir(okulSlug, kullaniciId, rol, ver);
      if (s.hata) setHata(s.hata);
    });

  return (
    <div className="space-y-4">
      {kodKutusu ? (
        <div className="rounded-kart border border-mavi/30 bg-mavi-acik p-4">
          <div className="text-sm font-bold text-mavi-koyu">
            {kodKutusu.ad} için yeni davet kodu
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold tracking-widest text-mavi-koyu">
            {kodKutusu.kod}
          </div>
          <p className="mt-2 text-sm text-mavi-koyu">
            Bu kod bir daha gösterilmeyecek — şimdi kopyalayıp kullanıcıya iletin.
            Kullanıcının eski şifresi geçersiz oldu; İlk Giriş sayfasından bu kodla
            yeni şifresini belirleyecek.
          </p>
          <button
            type="button"
            onClick={() => setKodKutusu(null)}
            className="mt-3 rounded-lg border border-mavi/40 bg-white px-3 py-1.5 text-sm font-semibold text-mavi-koyu"
          >
            Kapat
          </button>
        </div>
      ) : null}

      {rolKutusu ? (
        <div className="rounded-kart border border-cizgi bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-bold">
              {rolKutusu.ad} {rolKutusu.soyad} — roller
            </div>
            <div className="text-sm text-soluk">
              {rolKutusu.roller.map((r) => ROL_ADI[r] ?? r).join(", ")}
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <RolSatiri
              baslik="Mentör"
              aciklama="Öğrencilere mentör olarak atanabilir; gönderilerini onaylar ve hedef verir."
              acik={rolKutusu.roller.includes("mentor")}
              bekliyor={bekliyor}
              degistir={(ver) => rolAyarla(rolKutusu.id, "mentor", ver)}
            />
            <RolSatiri
              baslik="Rehber"
              /* Yöneticinin ne verdiğini bilmesi gereken tek yer burası:
                 düğmeye basınca açılan veri, kendisinin göremediği veri. */
              aciklama="Rehberlik servisi paneline erişir: risk kuyruğu, vakalar, görüşme notları ve randevular. Bu kayıtları okul yönetimi göremez — yetkiyi yalnızca rehber öğretmenlere verin."
              vurgulu
              acik={rolKutusu.roller.includes("rehber")}
              bekliyor={bekliyor}
              degistir={(ver) => rolAyarla(rolKutusu.id, "rehber", ver)}
            />
          </div>

          <p className="mt-3 text-xs text-soluk">
            Rol değişiklikleri denetim kaydına yazılır.
          </p>
          <button
            type="button"
            onClick={() => setRolKutusuId(null)}
            className="mt-2 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
          >
            Kapat
          </button>
        </div>
      ) : null}

      {hata ? (
        <div className="rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          {hata}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {ROL_SUZGECLERI.map((s) => (
          <button
            key={s.deger}
            type="button"
            onClick={() => setSuzgec(s.deger)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              suzgec === s.deger
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {s.etiket}
            <span className={suzgec === s.deger ? "ml-1.5 opacity-80" : "ml-1.5 text-soluk"}>
              {sayilar[s.deger]}
            </span>
          </button>
        ))}
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Ad, okul no, e-posta ara"
          className="ml-auto w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-kart border border-cizgi bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-cizgi bg-zemin text-left text-xs uppercase text-soluk">
            <tr>
              <th className="px-3 py-2 font-bold">Ad Soyad</th>
              <th className="px-3 py-2 font-bold">Roller</th>
              <th className="px-3 py-2 font-bold">Kimlik</th>
              <th className="px-3 py-2 font-bold">Giriş</th>
              <th className="px-3 py-2 text-right font-bold">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((k) => (
              <tr key={k.id} className="border-b border-cizgi last:border-0">
                <td className="px-3 py-2">
                  <div className="font-semibold">
                    {k.ad} {k.soyad}
                  </div>
                  {k.durum === "pasif" ? (
                    <span className="text-xs font-bold text-marka">Pasif</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-soluk">
                  {k.roller.map((r) => ROL_ADI[r] ?? r).join(", ")}
                </td>
                <td className="px-3 py-2 text-soluk">
                  {k.okulNo ? `No ${k.okulNo}${k.sinif ? ` · ${k.sinif}` : ""}` : null}
                  {k.eposta ?? (k.okulNo ? null : k.telefon)}
                </td>
                <td className="px-3 py-2">
                  {k.sifreBelirlendiMi ? (
                    <span className="text-soluk">Şifre belirlendi</span>
                  ) : (
                    <span className="font-semibold text-uyari">Davet kodu bekliyor</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={bekliyor}
                      onClick={() =>
                        basla(async () => {
                          setHata(null);
                          const s = await davetKoduYenile(okulSlug, k.id);
                          if (s.hata) setHata(s.hata);
                          else if (s.kod) setKodKutusu({ ad: s.kullaniciAdi ?? "", kod: s.kod });
                        })
                      }
                      className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin disabled:opacity-50"
                    >
                      Şifre sıfırla
                    </button>
                    {personelMi(k) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setHata(null);
                          setRolKutusuId(k.id);
                        }}
                        className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin"
                      >
                        Roller
                      </button>
                    ) : null}
                    {k.id === kendiId ? null : (
                      <button
                        type="button"
                        disabled={bekliyor}
                        onClick={() =>
                          basla(async () => {
                            setHata(null);
                            const s = await durumDegistir(
                              okulSlug,
                              k.id,
                              k.durum === "aktif" ? "pasif" : "aktif",
                            );
                            if (s.hata) setHata(s.hata);
                          })
                        }
                        className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin disabled:opacity-50"
                      >
                        {k.durum === "aktif" ? "Kapat" : "Aç"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {liste.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-soluk">
                  Bu süzgece uyan kullanıcı yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolSatiri({
  baslik,
  aciklama,
  acik,
  bekliyor,
  vurgulu,
  degistir,
}: {
  baslik: string;
  aciklama: string;
  acik: boolean;
  bekliyor: boolean;
  vurgulu?: boolean;
  degistir: (ver: boolean) => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-kart border p-3 ${
        vurgulu ? "border-lacivert/25 bg-lacivert-acik" : "border-cizgi bg-zemin"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">
          {baslik}
          {acik ? (
            <span className="ml-2 rounded-chip bg-basarili-acik px-2 py-0.5 text-[11px] font-bold text-basarili">
              Yetkili
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-soluk">{aciklama}</p>
      </div>
      <button
        type="button"
        disabled={bekliyor}
        onClick={() => degistir(!acik)}
        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
          acik
            ? "border border-cizgi bg-white hover:bg-zemin"
            : "bg-lacivert text-white hover:bg-lacivert/90"
        }`}
      >
        {acik ? "Yetkiyi al" : `${baslik} yap`}
      </button>
    </div>
  );
}
