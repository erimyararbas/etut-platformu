"use client";

/**
 * Günlük çözülen soru grafiği.
 *
 * TEK SERİ, TEK EKSEN. "Soru sayısı" ve "net" farklı ölçekler; ikisini aynı
 * grafiğe iki y-ekseniyle koymak grafik işinin en yaygın hatası. Net, üstteki
 * özet kutusunda duruyor.
 *
 * Doğru/yanlış kırılımı bilerek yığılmış çubuk YAPILMADI: palet doğrulayıcısı
 * marka kırmızısı ile yeşilin döteranopide ΔE 7.0 ile ayrışamadığını söyledi
 * (6–8 bandı yalnızca ikincil kodlamayla meşru) ve telefon genişliğinde üç
 * parçalı çubuk zaten okunmuyor. Kırılım ipucunda ve tabloda.
 *
 * SVG DEĞİL HTML: çubuk kalınlığı 24px'le sınırlı olmalı ve gerilmiş bir
 * viewBox'ta piksel genişliği kaba bağlı kalır. Flex kutular gerçek piksel
 * denetimi veriyor; yuvarlak tepe, 2px yüzey boşluğu ve dokunma hedefi
 * doğrudan CSS'ten.
 *
 * Çalışılmayan günler grafikte YER KAPLAR: asıl anlatan şey boşluklar.
 */

import { useId, useState } from "react";
import { kisaTarih, sureMetni, type GunlukKayit } from "@/lib/calisma/gorunum";

interface Props {
  seri: GunlukKayit[];
  /** Vurgulanacak gün (bugün). */
  bugun: string;
}

const PLAN_YUKSEKLIK = 120;

export function GunlukCalismaGrafigi({ seri, bugun }: Props) {
  const [secili, setSecili] = useState<GunlukKayit | null>(null);
  const [tabloAcik, setTabloAcik] = useState(false);
  const baslikId = useId();

  const enYuksek = Math.max(...seri.map((g) => g.soru), 1);
  const toplam = seri.reduce((n, g) => n + g.soru, 0);
  const calisilanGun = seri.filter((g) => g.soru > 0).length;
  const zirve = seri.reduce((a, b) => (b.soru > a.soru ? b : a), seri[0]);

  return (
    <section className="rounded-kart border border-cizgi bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={baslikId} className="text-sm font-bold">
          Günlük çözülen soru
        </h2>
        <span className="text-xs text-soluk">son {seri.length} gün</span>
      </div>
      <p className="mt-0.5 text-sm text-soluk">
        {toplam === 0
          ? "Bu dönemde kayıtlı çalışma yok."
          : `${seri.length} günün ${calisilanGun}'inde çalışılmış · toplam ${toplam} soru`}
      </p>

      {toplam > 0 ? (
        <>
          <div className="relative mt-4" onMouseLeave={() => setSecili(null)}>
            {/* Izgara: düz saç teli, yüzeyden bir ton uzak, geri planda */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ height: PLAN_YUKSEKLIK }}
            >
              {[0, 0.5, 1].map((o) => (
                <div
                  key={o}
                  className="absolute inset-x-0 border-t border-cizgi"
                  style={{ top: `${o * 100}%` }}
                />
              ))}
            </div>

            <ul
              className="relative flex items-end gap-0.5"
              style={{ height: PLAN_YUKSEKLIK }}
              aria-labelledby={baslikId}
            >
              {seri.map((g) => {
                const bugunMu = g.tarih === bugun;
                const soluk = secili !== null && secili.tarih !== g.tarih;

                return (
                  <li key={g.tarih} className="flex h-full flex-1 items-end">
                    <button
                      type="button"
                      onMouseEnter={() => setSecili(g)}
                      onFocus={() => setSecili(g)}
                      onBlur={() => setSecili(null)}
                      onClick={() => setSecili(g)}
                      aria-label={`${kisaTarih(g.tarih)}: ${g.soru} soru`}
                      /* Dokunma hedefi çubuktan geniş: kutunun tamamı tıklanır. */
                      className="flex h-full w-full items-end justify-center rounded-sm outline-none focus-visible:bg-lacivert/5"
                    >
                      {g.soru > 0 ? (
                        <span
                          /* Tepe 4px yuvarlak, taban kare; en fazla 24px kalın. */
                          className={`block w-full max-w-[24px] rounded-t-[4px] transition-opacity ${
                            bugunMu ? "bg-lacivert" : "bg-mavi"
                          } ${soluk ? "opacity-45" : "opacity-100"}`}
                          style={{
                            height: `${Math.max((g.soru / enYuksek) * 100, 4)}%`,
                          }}
                        />
                      ) : (
                        /* Çalışılmayan gün: taban çizgisinde ince bir iz.
                           Hiçbir şey çizmemek "veri yok" ile "sıfır" arasındaki
                           farkı siler. */
                        <span className="block h-[2px] w-full max-w-[24px] bg-cizgi" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Uç etiketler: yalnızca ilk ve son gün. Her çubuğa tarih yazmak
                telefon genişliğinde üst üste biner. */}
            <div className="mt-1 flex justify-between text-[11px] text-soluk">
              <span>{kisaTarih(seri[0].tarih)}</span>
              <span>{kisaTarih(seri[seri.length - 1].tarih)}</span>
            </div>
          </div>

          {/* İpucu ipucudur, tek erişim yolu değil: değerler tabloda da var. */}
          <div className="mt-2 min-h-[2.75rem] text-sm">
            {secili ? (
              <div className="rounded-lg border border-cizgi bg-zemin px-3 py-2">
                <span className="font-bold">{kisaTarih(secili.tarih)}</span>{" "}
                <span className="text-soluk">
                  · {secili.soru} soru · {secili.dogru}D {secili.yanlis}Y {secili.bos}B · net{" "}
                  {secili.net}
                  {secili.sureSaniye > 0 ? ` · ${sureMetni(secili.sureSaniye)}` : ""}
                </span>
              </div>
            ) : (
              <p className="text-soluk">
                En yüksek gün: <span className="font-semibold">{kisaTarih(zirve.tarih)}</span> (
                {zirve.soru} soru). Bir güne dokunarak ayrıntısını gör.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTabloAcik((a) => !a)}
            className="mt-1 text-sm font-semibold text-mavi underline"
          >
            {tabloAcik ? "Tabloyu gizle" : "Tabloyu göster"}
          </button>

          {tabloAcik ? (
            <div className="mt-2 overflow-x-auto rounded-lg border border-cizgi">
              <table className="w-full text-sm">
                <caption className="sr-only">Günlük çözülen soru sayıları</caption>
                <thead className="bg-zemin text-left text-xs uppercase text-soluk">
                  <tr>
                    <th className="px-3 py-1.5 font-bold">Gün</th>
                    <th className="px-3 py-1.5 font-bold">Soru</th>
                    <th className="px-3 py-1.5 font-bold">D/Y/B</th>
                    <th className="px-3 py-1.5 font-bold">Net</th>
                    <th className="px-3 py-1.5 font-bold">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {seri
                    .filter((g) => g.soru > 0)
                    .map((g) => (
                      <tr key={g.tarih} className="border-t border-cizgi">
                        <td className="px-3 py-1.5">{kisaTarih(g.tarih)}</td>
                        <td className="px-3 py-1.5 tabular-nums">{g.soru}</td>
                        <td className="px-3 py-1.5 tabular-nums text-soluk">
                          {g.dogru}/{g.yanlis}/{g.bos}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">{g.net}</td>
                        <td className="px-3 py-1.5 text-soluk">{sureMetni(g.sureSaniye)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
