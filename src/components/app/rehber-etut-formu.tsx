"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { rehberEtutAc } from "@/lib/etut/rehber-actions";
import { birebirMi, saatSecenekleri, bitisSaati } from "@/lib/etut/kurallar";
import type { DizinOgrencisi, DizinOgretmeni } from "@/lib/rehberlik/dizin";

const SAATLER = saatSecenekleri();

interface Secenek {
  id: string;
  ad: string;
}
interface Derslik {
  id: string;
  kod: string;
  kapasite: number;
}
interface Konu {
  id: string;
  ad: string;
  subject_id: string;
}
interface Talep {
  id: string;
  ogrenciId: string;
  dersId: string;
  konuId: string;
  neden: string;
}

interface Props {
  okulSlug: string;
  bugun: string;
  ogretmenler: DizinOgretmeni[];
  ogrenciler: DizinOgrencisi[];
  dersler: Secenek[];
  turler: Secenek[];
  derslikler: Derslik[];
  konular: Konu[];
  /** Bir talebi karşılıyorsak form önceden dolu gelir. */
  talep: Talep | null;
}

export function RehberEtutFormu({
  okulSlug,
  bugun,
  ogretmenler,
  ogrenciler,
  dersler,
  turler,
  derslikler,
  konular,
  talep,
}: Props) {
  const [ogretmenId, setOgretmenId] = useState("");
  const [dersId, setDersId] = useState(talep?.dersId ?? "");
  const [konuId, setKonuId] = useState(talep?.konuId ?? "");
  const [turId, setTurId] = useState("");
  const [derslikId, setDerslikId] = useState("");
  const [tarih, setTarih] = useState(bugun);
  const [baslangic, setBaslangic] = useState("16:00");
  const [bitis, setBitis] = useState("17:00");
  const [kontenjan, setKontenjan] = useState("3");
  const [aciklama, setAciklama] = useState(
    talep ? `Talep üzerine açıldı: ${talep.neden}` : "",
  );
  const [secililer, setSecililer] = useState<string[]>(
    talep ? [talep.ogrenciId] : [],
  );
  const [arama, setArama] = useState("");
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [bekliyor, basla] = useTransition();

  const birebir = birebirMi(turler.find((t) => t.id === turId)?.ad);
  const etkinKontenjan = birebir ? 1 : Number(kontenjan || 0);

  const dersKonulari = useMemo(
    () => konular.filter((k) => k.subject_id === dersId),
    [konular, dersId],
  );

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    const uygun = q
      ? ogrenciler.filter((o) =>
          [o.adSoyad, o.okulNo, o.sinif ?? ""].some((x) =>
            x.toLocaleLowerCase("tr-TR").includes(q),
          ),
        )
      : ogrenciler;
    // Seçili öğrenciler her zaman listede kalmalı; arama onları gizlerse
    // rehber kimi seçtiğini göremez.
    const seciliOlanlar = ogrenciler.filter((o) => secililer.includes(o.id));
    return [...new Set([...seciliOlanlar, ...uygun])].slice(0, 60);
  }, [ogrenciler, arama, secililer]);

  const degistir = (id: string) =>
    setSecililer((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${okulSlug}/rehberlik`}
          className="rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          ← Geri
        </Link>
        <div>
          <h1 className="text-lg font-extrabold leading-tight">Etüt aç</h1>
          <p className="text-sm text-soluk">
            Seçtiğiniz öğretmen adına etüt açılır ve seçtiğiniz öğrenciler atanır.
          </p>
        </div>
      </div>

      {talep ? (
        <div className="rounded-kart border border-mavi/30 bg-mavi-acik p-3 text-sm text-mavi-koyu">
          <b>Talep karşılanıyor.</b> Etüt açıldığında talep otomatik olarak
          “karşılandı” işaretlenir ve öğrenciye bildirim gider.
          <p className="mt-1 italic">“{talep.neden}”</p>
        </div>
      ) : null}

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

      <div className="space-y-3 rounded-kart border border-cizgi bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Öğretmen
            <select
              value={ogretmenId}
              onChange={(e) => {
                setOgretmenId(e.target.value);
                // Ders öğretmenin branşından geliyor; rehber isterse değiştirir.
                const o = ogretmenler.find((x) => x.id === e.target.value);
                if (o?.bransId && !talep) setDersId(o.bransId);
              }}
              className="mt-1 block w-56 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            >
              <option value="">Seçin…</option>
              {ogretmenler.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.adSoyad}
                  {o.brans ? ` · ${o.brans}` : ""}
                </option>
              ))}
            </select>
          </label>

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
            Konu
            <select
              value={konuId}
              onChange={(e) => setKonuId(e.target.value)}
              disabled={!dersId}
              className="mt-1 block w-48 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal disabled:opacity-50"
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

        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Tür
            <select
              value={turId}
              onChange={(e) => setTurId(e.target.value)}
              className="mt-1 block w-44 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            >
              <option value="">Seçin…</option>
              {turler.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ad}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold">
            Tarih
            <input
              type="date"
              value={tarih}
              min={bugun}
              onChange={(e) => setTarih(e.target.value)}
              className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
            />
          </label>

          <label className="text-sm font-semibold">
            Başlangıç
            <select
              value={baslangic}
              onChange={(e) => {
                setBaslangic(e.target.value);
                setBitis(bitisSaati(e.target.value, 60) ?? e.target.value);
              }}
              className="mt-1 block rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            >
              {SAATLER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold">
            Bitiş
            <select
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              className="mt-1 block rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            >
              {SAATLER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Derslik
            <select
              value={derslikId}
              onChange={(e) => setDerslikId(e.target.value)}
              className="mt-1 block w-40 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            >
              <option value="">—</option>
              {derslikler.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.kod} ({d.kapasite})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold">
            Kontenjan
            {birebir ? (
              <div className="mt-1 w-24 rounded-lg border border-cizgi bg-zemin px-3 py-1.5 text-sm font-semibold">
                1
              </div>
            ) : (
              <input
                type="number"
                min={1}
                max={500}
                value={kontenjan}
                onChange={(e) => setKontenjan(e.target.value)}
                className="mt-1 block w-24 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
              />
            )}
          </label>
        </div>

        {birebir ? (
          <p className="text-xs text-soluk">
            Birebir etüt tek öğrenciyle yapılır; kontenjan 1&apos;dir.
          </p>
        ) : null}

        <label className="block text-sm font-semibold">
          Açıklama
          <textarea
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      {/* Öğrenci seçimi */}
      <div className="space-y-2 rounded-kart border border-cizgi bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            Öğrenciler
            <span className="ml-2 font-normal text-soluk">
              {secililer.length} seçili
              {etkinKontenjan > 0 ? ` / ${etkinKontenjan} kontenjan` : ""}
            </span>
          </span>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Ad, okul no, sınıf ara"
            className="w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm sm:w-56"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {liste.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                secililer.includes(o.id)
                  ? "border-lacivert bg-lacivert-acik"
                  : "border-cizgi hover:bg-zemin"
              }`}
            >
              <input
                type="checkbox"
                checked={secililer.includes(o.id)}
                onChange={() => degistir(o.id)}
                className="size-4"
              />
              <span className="font-semibold">{o.adSoyad}</span>
              <span className="text-soluk">
                No {o.okulNo}
                {o.sinif ? ` · ${o.sinif}` : ""}
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-soluk">
          Atanan öğrenci kendini etütten çıkaramaz; gelemeyecekse gerekçeli iptal
          talebi açar ve siz karara bağlarsınız.
        </p>
      </div>

      <button
        type="button"
        disabled={bekliyor || !ogretmenId || !dersId || !turId || secililer.length === 0}
        onClick={() =>
          basla(async () =>
            setSonuc(
              await rehberEtutAc(okulSlug, {
                ogretmenId,
                dersId,
                konuId,
                turId,
                derslikId,
                tarih,
                baslangic,
                bitis,
                kontenjan: etkinKontenjan,
                aciklama,
                ogrenciIdler: secililer,
                talepId: talep?.id ?? "",
              }),
            ),
          )
        }
        className="rounded-lg bg-marka px-5 py-2.5 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
      >
        Etüdü aç
      </button>
    </div>
  );
}
