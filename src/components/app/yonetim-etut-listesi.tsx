"use client";

/**
 * Yöneticinin etüt listesi: durum süzgeci, arama ve iptal.
 *
 * İptal geri alınamaz bir iş değil ama öğrencinin planını bozar; bu yüzden
 * gerekçe zorunlu ve gerekçe öğrencilere aynen gider (0014'teki tetikleyici
 * bildirim gövdesine yazar).
 */

import { useMemo, useState, useTransition } from "react";
import type { EtutOzeti } from "@/lib/etut/sorgular";
import { etudiIptalEt } from "@/app/[okul]/yonetim/etutler/actions";

const DURUM_ADI: Record<string, string> = {
  taslak: "Taslak",
  onay_bekliyor: "Onay bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  iptal: "İptal",
};

const DURUM_SINIFI: Record<string, string> = {
  onaylandi: "border-basarili/30 bg-basarili-acik text-basarili",
  onay_bekliyor: "border-uyari/30 bg-uyari-acik text-uyari",
  reddedildi: "border-marka/30 bg-marka-acik text-marka-koyu",
  iptal: "border-cizgi bg-zemin text-soluk",
  taslak: "border-cizgi bg-zemin text-soluk",
};

type Suzgec = "hepsi" | "onaylandi" | "onay_bekliyor" | "iptal_red" | "gelecek" | "gecmis";

const SUZGECLER: { deger: Suzgec; etiket: string }[] = [
  { deger: "hepsi", etiket: "Tümü" },
  { deger: "gelecek", etiket: "Yaklaşan" },
  { deger: "onay_bekliyor", etiket: "Onay bekleyen" },
  { deger: "onaylandi", etiket: "Onaylı" },
  { deger: "iptal_red", etiket: "İptal / Red" },
  { deger: "gecmis", etiket: "Geçmiş" },
];

function kucult(s: string) {
  return s.toLocaleLowerCase("tr-TR");
}

interface Props {
  okulSlug: string;
  etutler: EtutOzeti[];
  /** Okulun saat dilimindeki bugün ("YYYY-MM-DD"). */
  bugun: string;
}

export function YonetimEtutListesi({ okulSlug, etutler, bugun }: Props) {
  const [suzgec, setSuzgec] = useState<Suzgec>("gelecek");
  const [arama, setArama] = useState("");
  const [bekliyor, basla] = useTransition();
  const [iptalEdilen, setIptalEdilen] = useState<string | null>(null);
  const [neden, setNeden] = useState("");
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});

  const liste = useMemo(() => {
    const q = kucult(arama.trim());
    return etutler.filter((e) => {
      const uygun =
        suzgec === "hepsi"
          ? true
          : suzgec === "gelecek"
            ? e.tarih >= bugun && e.durum !== "iptal" && e.durum !== "reddedildi"
            : suzgec === "gecmis"
              ? e.tarih < bugun
              : suzgec === "iptal_red"
                ? e.durum === "iptal" || e.durum === "reddedildi"
                : e.durum === suzgec;
      if (!uygun) return false;
      if (!q) return true;
      return [e.ders, e.ogretmen, e.konu, e.derslik, e.tur]
        .filter((x): x is string => Boolean(x))
        .some((x) => kucult(x).includes(q));
    });
  }, [etutler, suzgec, arama, bugun]);

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-center gap-2">
        {SUZGECLER.map((s) => (
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
          </button>
        ))}
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Ders, öğretmen, derslik ara"
          className="ml-auto w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      {liste.length === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          Bu süzgece uyan etüt yok.
        </div>
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => (
            <li key={e.id} className="rounded-kart border border-cizgi bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{e.ders}</span>
                <span
                  className={`rounded-chip border px-2 py-0.5 text-[11px] font-bold ${
                    DURUM_SINIFI[e.durum] ?? DURUM_SINIFI.taslak
                  }`}
                >
                  {DURUM_ADI[e.durum] ?? e.durum}
                </span>
              </div>
              <div className="text-sm text-soluk">
                {e.tarih} · {e.baslangic}–{e.bitis} · {e.ogretmen}
                {e.derslik ? ` · ${e.derslik}` : ""}
              </div>
              <div className="mt-1 text-sm text-soluk">
                {e.tur}
                {e.konu ? ` · ${e.konu}` : ""} · {e.dolu}/{e.kontenjan} dolu
                {e.bekleyen > 0 ? ` · ${e.bekleyen} sırada` : ""}
                {e.uygunSiniflar.length ? ` · ${e.uygunSiniflar.join(", ")}` : ""}
              </div>
              {e.redNedeni ? (
                <div className="mt-1 text-sm text-marka-koyu">Gerekçe: {e.redNedeni}</div>
              ) : null}

              {e.durum === "onaylandi" || e.durum === "onay_bekliyor" ? (
                iptalEdilen === e.id ? (
                  <div className="mt-2 space-y-2 border-t border-cizgi pt-2">
                    <label className="block text-sm font-semibold">
                      İptal gerekçesi
                      <input
                        value={neden}
                        onChange={(ev) => setNeden(ev.target.value)}
                        placeholder="Öğrencilere bu metin iletilecek"
                        className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={bekliyor}
                        onClick={() =>
                          basla(async () => {
                            const s = await etudiIptalEt(okulSlug, {
                              etutId: e.id,
                              neden,
                            });
                            setSonuc(s);
                            if (s.basari) {
                              setIptalEdilen(null);
                              setNeden("");
                            }
                          })
                        }
                        className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        İptali onayla
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIptalEdilen(null);
                          setNeden("");
                        }}
                        className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIptalEdilen(e.id);
                      setSonuc({});
                    }}
                    className="mt-2 rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                  >
                    Etüdü iptal et
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
