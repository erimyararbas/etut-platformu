"use client";

/**
 * Akademik yapının sekmeli görünümü.
 *
 * Beş liste de aynı sayfada; sekme değişimi sunucuya gitmez çünkü veri zaten
 * tek sorguda gelmiş durumda. Bir okulun sınıf/ders/derslik sayısı yüzlerle
 * ölçülür, konu sayısı birkaç bin — hepsi tek seferde taşınabilir.
 */

import { useState } from "react";
import type { AkademikYapi } from "@/lib/yonetim/akademik";

type Sekme = "siniflar" | "dersler" | "konular" | "derslikler" | "turler";

const SEKMELER: { deger: Sekme; etiket: string }[] = [
  { deger: "siniflar", etiket: "Sınıflar" },
  { deger: "dersler", etiket: "Dersler" },
  { deger: "konular", etiket: "Konular" },
  { deger: "derslikler", etiket: "Derslikler" },
  { deger: "turler", etiket: "Etüt Türleri" },
];

export function AkademikYapiPaneli({ yapi }: { yapi: AkademikYapi }) {
  const [sekme, setSekme] = useState<Sekme>("siniflar");

  const sayi: Record<Sekme, number> = {
    siniflar: yapi.siniflar.length,
    dersler: yapi.dersler.length,
    konular: yapi.konular.length,
    derslikler: yapi.derslikler.length,
    turler: yapi.turler.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SEKMELER.map((s) => (
          <button
            key={s.deger}
            type="button"
            onClick={() => setSekme(s.deger)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              sekme === s.deger
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {s.etiket}
            <span className={sekme === s.deger ? "ml-1.5 opacity-80" : "ml-1.5 text-soluk"}>
              {sayi[s.deger]}
            </span>
          </button>
        ))}
      </div>

      {sayi[sekme] === 0 ? (
        <Bos />
      ) : sekme === "siniflar" ? (
        <Tablo
          basliklar={["Sınıf", "Seviye", "Mevcut"]}
          satirlar={yapi.siniflar.map((s) => [s.kod, s.seviye ?? "—", String(s.ogrenciSayisi)])}
        />
      ) : sekme === "dersler" ? (
        <Tablo
          basliklar={["Ders", "Kod", "Konu sayısı", "Durum"]}
          satirlar={yapi.dersler.map((d) => [
            d.ad,
            d.kod ?? "—",
            String(d.konuSayisi),
            d.aktif ? "Aktif" : "Pasif",
          ])}
        />
      ) : sekme === "konular" ? (
        <Tablo
          basliklar={["Ders", "Seviye", "Konu", "Sıra"]}
          satirlar={yapi.konular.map((k) => [
            k.ders,
            k.seviye ?? "—",
            k.ad,
            String(k.sira),
          ])}
        />
      ) : sekme === "derslikler" ? (
        <Tablo
          basliklar={["Kod", "Bina", "Kat", "Kapasite", "Durum"]}
          satirlar={yapi.derslikler.map((d) => [
            d.kod,
            d.bina ?? "—",
            d.kat ?? "—",
            String(d.kapasite),
            d.aktif ? "Aktif" : "Pasif",
          ])}
        />
      ) : (
        <Tablo
          basliklar={["Tür", "Durum"]}
          satirlar={yapi.turler.map((t) => [t.ad, t.aktif ? "Aktif" : "Pasif"])}
        />
      )}
    </div>
  );
}

function Bos() {
  return (
    <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
      Bu liste boş. İlgili Excel şablonunu Veri Aktarımı ekranından yükleyin.
    </div>
  );
}

function Tablo({ basliklar, satirlar }: { basliklar: string[]; satirlar: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-kart border border-cizgi bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-cizgi bg-zemin text-left text-xs uppercase text-soluk">
          <tr>
            {basliklar.map((b) => (
              <th key={b} className="px-3 py-2 font-bold">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((s, i) => (
            <tr key={`${s[0]}-${i}`} className="border-b border-cizgi last:border-0">
              {s.map((h, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2 font-semibold" : "px-3 py-2 text-soluk"}>
                  {h}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
