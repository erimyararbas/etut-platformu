"use client";

/**
 * Öğrencinin etüt talebi.
 *
 * Kapalı başlıyor: ana ekranın işi açık etütleri göstermek, talep açmak
 * istisna. Açık bir form her gün listenin üstünü kaplardı.
 *
 * Bekleyen talepler formun içinde de görünüyor — öğrenci "istemiştim, ne
 * oldu?" sorusunu aynı yerden cevaplayabilsin.
 */

import { useMemo, useState, useTransition } from "react";
import { etutTalepEt } from "@/lib/etut/rehber-actions";
import { TALEP_DURUM_ADI, TALEP_DURUM_SINIFI } from "@/lib/etut/talep-gorunum";
import type { EtutTalebi } from "@/lib/etut/talep-gorunum";

interface Konu {
  id: string;
  ad: string;
  subject_id: string;
}

interface Props {
  okulSlug: string;
  dersler: { id: string; ad: string }[];
  konular: Konu[];
  talepler: EtutTalebi[];
}

export function EtutTalepFormu({ okulSlug, dersler, konular, talepler }: Props) {
  const [acik, setAcik] = useState(false);
  const [dersId, setDersId] = useState("");
  const [konuId, setKonuId] = useState("");
  const [neden, setNeden] = useState("");
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [bekliyor, basla] = useTransition();

  const dersKonulari = useMemo(
    () => konular.filter((k) => k.subject_id === dersId),
    [konular, dersId],
  );

  const bekleyen = talepler.filter((t) => t.durum === "bekliyor").length;

  return (
    <section className="mb-5 rounded-kart border border-cizgi bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">Aradığın etüt yok mu?</h2>
          <p className="text-sm text-soluk">
            Rehberlik servisinden etüt isteyebilirsin.
            {bekleyen > 0 ? ` ${bekleyen} talebin yanıt bekliyor.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAcik((a) => !a);
            setSonuc({});
          }}
          className="rounded-lg border border-cizgi px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          {acik ? "Kapat" : "Etüt talep et"}
        </button>
      </div>

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

      {acik ? (
        <div className="mt-3 space-y-3 border-t border-cizgi pt-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-semibold">
              Ders
              <select
                value={dersId}
                onChange={(e) => {
                  setDersId(e.target.value);
                  setKonuId("");
                }}
                className="mt-1 block w-44 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
              >
                <option value="">Seçin…</option>
                {dersler.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.ad}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Konu (isteğe bağlı)
              <select
                value={konuId}
                onChange={(e) => setKonuId(e.target.value)}
                disabled={!dersId}
                className="mt-1 block w-52 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal disabled:opacity-50"
              >
                <option value="">—</option>
                {dersKonulari.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ad}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold">
            Neye ihtiyacın var?
            <textarea
              value={neden}
              onChange={(e) => setNeden(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Türev konusunda zincir kuralını anlamadım, soru çözerken takılıyorum."
              className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
            />
          </label>

          <button
            type="button"
            disabled={bekliyor || !dersId || neden.trim().length < 10}
            onClick={() =>
              basla(async () => {
                const s = await etutTalepEt(okulSlug, { dersId, konuId, neden });
                setSonuc(s);
                if (s.basari) {
                  setAcik(false);
                  setDersId("");
                  setKonuId("");
                  setNeden("");
                }
              })
            }
            className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
          >
            Gönder
          </button>
        </div>
      ) : null}

      {talepler.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-cizgi pt-3">
          {talepler.slice(0, 5).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <b>{t.ders ?? "Ders"}</b>
                {t.konu ? <span className="text-soluk"> · {t.konu}</span> : null}
                {t.kararNotu ? (
                  <span className="block text-xs text-soluk">{t.kararNotu}</span>
                ) : null}
              </span>
              <span
                className={`rounded-chip px-2 py-0.5 text-[11px] font-bold ${TALEP_DURUM_SINIFI[t.durum]}`}
              >
                {TALEP_DURUM_ADI[t.durum]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
