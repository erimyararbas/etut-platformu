"use client";

/**
 * Öğretmenin onayını bekleyen etütler — rehberin onun adına açtıkları (0029).
 *
 * Öğretmenin kendi açtığı ve YÖNETİCİ onayı bekleyen etütler buraya girmez;
 * onları onaylayacak kişi yönetici. İki kuyruğu karıştırmak, öğretmene
 * "kendi etüdünü onayla" gibi anlamsız bir düğme gösterirdi.
 */

import { useState, useTransition } from "react";
import { rehberEtudunuKararaBagla } from "@/app/[okul]/ogretmen/actions";
import type { EtutOzeti } from "@/lib/etut/sorgular";
import { tarihiYaz } from "@/lib/etut/kurallar";

interface Props {
  okulSlug: string;
  etutler: EtutOzeti[];
}

export function OnayimiBekleyenler({ okulSlug, etutler }: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [redAcik, setRedAcik] = useState<string | null>(null);
  const [neden, setNeden] = useState("");

  if (etutler.length === 0) return null;

  const calis = (islem: () => Promise<{ hata?: string; basari?: string }>) =>
    basla(async () => setSonuc(await islem()));

  return (
    <section className="mb-6">
      <div className="rounded-kart border border-uyari/30 bg-uyari-acik p-4">
        <h2 className="text-sm font-extrabold">
          Onayınızı bekleyen {etutler.length} etüt
        </h2>
        <p className="mt-0.5 text-sm text-soluk">
          Rehberlik servisi sizin adınıza açtı. Siz onaylayana kadar öğrencilere
          görünmez.
        </p>

        {sonuc.hata ? (
          <div className="mt-3 rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
            {sonuc.hata}
          </div>
        ) : null}
        {sonuc.basari ? (
          <div className="mt-3 rounded-kart border border-basarili/30 bg-basarili-acik p-3 text-sm font-semibold text-basarili">
            {sonuc.basari}
          </div>
        ) : null}

        <ul className="mt-3 space-y-2">
          {etutler.map((e) => (
            <li key={e.id} className="rounded-kart border border-cizgi bg-white p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold">{e.ders}</span>
                {e.konu ? <span className="text-sm text-soluk">· {e.konu}</span> : null}
                <span className="ml-auto text-sm text-soluk">
                  {tarihiYaz(e.tarih)} · {e.baslangic}–{e.bitis}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-soluk">
                {e.tur} · {e.kontenjan} kontenjan
                {e.derslik ? ` · ${e.derslik}` : ""}
              </p>
              {e.aciklama ? <p className="mt-1 text-sm">{e.aciklama}</p> : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bekliyor}
                  onClick={() => calis(() => rehberEtudunuKararaBagla(okulSlug, e.id, true))}
                  className="rounded-lg bg-basarili px-3 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRedAcik(redAcik === e.id ? null : e.id);
                    setNeden("");
                  }}
                  className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                >
                  Reddet
                </button>
              </div>

              {redAcik === e.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-soluk">
                    Gerekçe
                    <input
                      value={neden}
                      onChange={(e2) => setNeden(e2.target.value)}
                      placeholder="O saatte başka bir görevim var."
                      className="mt-0.5 block w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal text-ink"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={bekliyor}
                    onClick={() =>
                      calis(async () => {
                        const s = await rehberEtudunuKararaBagla(
                          okulSlug,
                          e.id,
                          false,
                          neden,
                        );
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
      </div>
    </section>
  );
}
