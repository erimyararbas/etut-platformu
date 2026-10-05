"use client";

/**
 * Rehberin etüt talebi kuyruğu.
 *
 * Talebi KARŞILAMAK ayrı bir sayfada (`/rehberlik/etut-ac`): etüt formu
 * öğretmen, ders, saat, derslik ve öğrenci seçimi istiyor ve bir sekmenin
 * içine sığdırıldığında hem dar kalıyor hem de rehber, listeyi kaybetmemek
 * için formu yarıda bırakamıyordu. Reddetmek kısa olduğu için burada.
 */

import { useState } from "react";
import Link from "next/link";
import { talebiReddet } from "@/lib/etut/rehber-actions";
import { TALEP_DURUM_ADI, TALEP_DURUM_SINIFI } from "@/lib/etut/talep-gorunum";
import type { EtutTalebi } from "@/lib/etut/talep-gorunum";

type Calis = (islem: () => Promise<{ hata?: string; basari?: string }>) => void;

interface Props {
  okulSlug: string;
  talepler: EtutTalebi[];
  bekliyor: boolean;
  calis: Calis;
}

export function TalepKuyrugu({ okulSlug, talepler, bekliyor, calis }: Props) {
  const [redAcik, setRedAcik] = useState<string | null>(null);
  const [neden, setNeden] = useState("");

  const bekleyenler = talepler.filter((t) => t.durum === "bekliyor");
  const kapananlar = talepler.filter((t) => t.durum !== "bekliyor");

  return (
    <section className="space-y-4">
      <div className="rounded-kart border border-cizgi bg-white p-3 text-sm text-soluk">
        Öğrenciler buradan etüt isteyebiliyor. Talebi karşılamak, seçtiğiniz
        öğretmen adına bir etüt açıp öğrenciyi ona atamak demek.
      </div>

      <div>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
          Bekleyen talepler ({bekleyenler.length})
        </h3>

        {bekleyenler.length === 0 ? (
          <p className="rounded-kart border border-dashed border-cizgi bg-white px-3 py-8 text-center text-sm text-soluk">
            Bekleyen talep yok.
          </p>
        ) : (
          <ul className="space-y-2">
            {bekleyenler.map((t) => (
              <li key={t.id} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {t.ogrenci ?? "Öğrenci"}
                    {t.sinif ? (
                      <span className="ml-1 font-normal text-soluk">· {t.sinif}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-soluk">
                    {t.ders ?? "Ders belirtilmedi"}
                    {t.konu ? ` · ${t.konu}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm">{t.neden}</p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/${okulSlug}/rehberlik/etut-ac?talep=${t.id}`}
                    className="rounded-lg bg-lacivert px-3 py-1 text-xs font-bold text-white hover:bg-lacivert/90"
                  >
                    Etüt aç
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setRedAcik(redAcik === t.id ? null : t.id);
                      setNeden("");
                    }}
                    className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                  >
                    Karşılanamaz
                  </button>
                  <Link
                    href={`/${okulSlug}/rapor/${t.ogrenciId}`}
                    className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                  >
                    Gelişim raporu
                  </Link>
                </div>

                {redAcik === t.id ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-soluk">
                      Gerekçe (öğrenciye iletilir)
                      <input
                        value={neden}
                        onChange={(e) => setNeden(e.target.value)}
                        placeholder="Bu hafta uygun öğretmen yok, önümüzdeki hafta açılacak."
                        className="mt-0.5 block w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal text-ink"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={bekliyor}
                      onClick={() =>
                        calis(async () => {
                          const s = await talebiReddet(okulSlug, t.id, neden);
                          if (s.basari) setRedAcik(null);
                          return s;
                        })
                      }
                      className="rounded-lg bg-marka px-3 py-1.5 text-xs font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
                    >
                      Gönder
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {kapananlar.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
            Karara bağlananlar ({kapananlar.length})
          </h3>
          <ul className="divide-y divide-cizgi overflow-hidden rounded-kart border border-cizgi bg-white text-sm">
            {kapananlar.slice(0, 20).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="min-w-0 flex-1">
                  <b>{t.ogrenci ?? "Öğrenci"}</b>
                  <span className="text-soluk">
                    {t.ders ? ` · ${t.ders}` : ""} — {t.neden}
                  </span>
                </span>
                <span
                  className={`rounded-chip px-2 py-0.5 text-[11px] font-bold ${TALEP_DURUM_SINIFI[t.durum]}`}
                >
                  {TALEP_DURUM_ADI[t.durum]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
