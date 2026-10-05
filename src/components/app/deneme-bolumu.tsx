"use client";

/**
 * Rehberin deneme sınavı ekranı: sınav listesi, sonuç tablosu, giriş formu.
 *
 * Sınav seçimi ADRES SATIRINDA taşınıyor (`?deneme=`), istemci state'inde
 * değil — sonuçlar sunucudan geliyor ve rehber bir sınavın bağlantısını
 * paylaşabiliyor. Vaka seçiminde de aynı kalıp kullanılmıştı.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  denemeAc,
  sonucKaydet,
  sonucSil,
  topluSonucKaydet,
} from "@/app/[okul]/rehberlik/deneme-actions";
import { ortalamaNet, tarihKisa } from "@/lib/deneme/gorunum";
import type { Deneme, DenemeOgrenciSatiri } from "@/lib/deneme/gorunum";
import type { DizinDersi, DizinOgrencisi } from "@/lib/rehberlik/dizin";

type Calis = (islem: () => Promise<{ hata?: string; basari?: string }>) => void;

interface Props {
  okulSlug: string;
  denemeler: Deneme[];
  seciliDeneme: string | null;
  sonuclar: DenemeOgrenciSatiri[];
  ogrenciler: DizinOgrencisi[];
  dersler: DizinDersi[];
  bekliyor: boolean;
  calis: Calis;
}

interface DersGirdisi {
  subjectId: string;
  dogru: string;
  yanlis: string;
  bos: string;
}

export function DenemeBolumu({
  okulSlug,
  denemeler,
  seciliDeneme,
  sonuclar,
  ogrenciler,
  dersler,
  bekliyor,
  calis,
}: Props) {
  const [yeniAcik, setYeniAcik] = useState(false);
  const [girisAcik, setGirisAcik] = useState(false);
  const [topluAcik, setTopluAcik] = useState(false);
  const [sorunlar, setSorunlar] = useState<string[]>([]);

  const acik = denemeler.find((d) => d.id === seciliDeneme) ?? null;
  const ortalama = useMemo(() => ortalamaNet(sonuclar), [sonuclar]);

  return (
    <section className="space-y-4">
      <div className="rounded-kart border border-cizgi bg-white p-3 text-sm text-soluk">
        Deneme sonuçları <b className="text-ink">gizli değildir</b>: öğrenci, velisi
        ve okul personeli görebilir. Görüşme notlarıyla aynı kapalılıkta değildir.
      </div>

      {/* Sınav listesi */}
      <div className="flex flex-wrap items-center gap-2">
        {denemeler.length === 0 ? (
          <p className="text-sm text-soluk">Henüz deneme açılmamış.</p>
        ) : (
          denemeler.slice(0, 12).map((d) => (
            <Link
              key={d.id}
              href={`/${okulSlug}/rehberlik?deneme=${d.id}`}
              aria-current={d.id === seciliDeneme ? "page" : undefined}
              className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
                d.id === seciliDeneme
                  ? "border-lacivert bg-lacivert text-white"
                  : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
              }`}
            >
              {d.ad}
              <span
                className={`ml-1.5 font-normal ${d.id === seciliDeneme ? "opacity-75" : "text-soluk"}`}
              >
                {tarihKisa(d.tarih)}
              </span>
            </Link>
          ))
        )}
        <button
          type="button"
          onClick={() => setYeniAcik((a) => !a)}
          className="ml-auto rounded-lg bg-lacivert px-3 py-1.5 text-sm font-bold text-white hover:bg-lacivert/90"
        >
          + Deneme aç
        </button>
      </div>

      {yeniAcik ? (
        <YeniDeneme
          okulSlug={okulSlug}
          bekliyor={bekliyor}
          calis={calis}
          kapat={() => setYeniAcik(false)}
        />
      ) : null}

      {acik ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-soluk">
              {acik.ad} · {tarihKisa(acik.tarih)}
              {acik.tur ? ` · ${acik.tur}` : ""}
            </h3>
            <div className="text-sm text-soluk">
              {sonuclar.length} öğrenci
              {ortalama !== null ? ` · ortalama ${ortalama} net` : ""}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGirisAcik((a) => !a)}
              className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
            >
              {girisAcik ? "Formu kapat" : "Tek öğrenci gir"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTopluAcik((a) => !a);
                setSorunlar([]);
              }}
              className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
            >
              {topluAcik ? "Toplu girişi kapat" : "Excel'den yapıştır"}
            </button>
          </div>

          {topluAcik ? (
            <TopluGiris
              okulSlug={okulSlug}
              examId={acik.id}
              bekliyor={bekliyor}
              calis={calis}
              sorunlar={sorunlar}
              setSorunlar={setSorunlar}
            />
          ) : null}

          {girisAcik ? (
            <SonucFormu
              okulSlug={okulSlug}
              examId={acik.id}
              ogrenciler={ogrenciler}
              dersler={dersler}
              bekliyor={bekliyor}
              calis={calis}
            />
          ) : null}

          {sonuclar.length === 0 ? (
            <p className="rounded-kart border border-dashed border-cizgi bg-white px-3 py-8 text-center text-sm text-soluk">
              Bu denemeye henüz sonuç girilmemiş.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-kart border border-cizgi bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-cizgi bg-zemin text-left text-xs uppercase text-soluk">
                  <tr>
                    <th className="px-3 py-2 font-bold">Öğrenci</th>
                    <th className="px-3 py-2 font-bold">Sınıf</th>
                    <th className="px-3 py-2 font-bold">Toplam Net</th>
                    <th className="px-3 py-2 font-bold">Puan</th>
                    <th className="px-3 py-2 font-bold">Sıralama</th>
                    <th className="px-3 py-2 text-right font-bold">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {sonuclar.map((r) => (
                    <tr key={r.ogrenciId} className="border-b border-cizgi last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{r.adSoyad}</div>
                        <div className="text-xs text-soluk">No {r.okulNo}</div>
                      </td>
                      <td className="px-3 py-2 text-soluk">{r.sinif ?? "—"}</td>
                      <td className="px-3 py-2 font-bold tabular-nums">{r.toplamNet}</td>
                      <td className="px-3 py-2 tabular-nums text-soluk">{r.puan ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-soluk">
                        {r.siralama ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            href={`/${okulSlug}/rapor/${r.ogrenciId}`}
                            className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin"
                          >
                            Rapor
                          </Link>
                          <button
                            type="button"
                            disabled={bekliyor}
                            onClick={() =>
                              calis(() => sonucSil(okulSlug, acik.id, r.ogrenciId))
                            }
                            className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin disabled:opacity-50"
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function YeniDeneme({
  okulSlug,
  bekliyor,
  calis,
  kapat,
}: {
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
  kapat: () => void;
}) {
  return (
    <form
      action={(f) =>
        calis(async () => {
          const s = await denemeAc(okulSlug, {
            ad: String(f.get("ad") ?? ""),
            tarih: String(f.get("tarih") ?? ""),
            tur: String(f.get("tur") ?? ""),
          });
          if (s.basari) kapat();
          return s;
        })
      }
      className="flex flex-wrap items-end gap-3 rounded-kart border border-cizgi bg-white p-4"
    >
      <label className="text-sm font-semibold">
        Deneme adı
        <input
          name="ad"
          required
          placeholder="TYT Deneme 3"
          className="mt-1 block w-56 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="text-sm font-semibold">
        Tarih
        <input
          type="date"
          name="tarih"
          required
          className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="text-sm font-semibold">
        Tür
        <input
          name="tur"
          placeholder="TYT"
          className="mt-1 block w-24 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
        />
      </label>
      <button
        type="submit"
        disabled={bekliyor}
        className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
      >
        Aç
      </button>
      <button
        type="button"
        onClick={kapat}
        className="rounded-lg border border-cizgi px-3 py-2 text-sm font-semibold hover:bg-zemin"
      >
        Vazgeç
      </button>
    </form>
  );
}

function SonucFormu({
  okulSlug,
  examId,
  ogrenciler,
  dersler,
  bekliyor,
  calis,
}: {
  okulSlug: string;
  examId: string;
  ogrenciler: DizinOgrencisi[];
  dersler: DizinDersi[];
  bekliyor: boolean;
  calis: Calis;
}) {
  const [ogrenciId, setOgrenciId] = useState("");
  const [arama, setArama] = useState("");
  const [girdiler, setGirdiler] = useState<DersGirdisi[]>([
    { subjectId: "", dogru: "", yanlis: "", bos: "" },
  ]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    if (!q) return ogrenciler.slice(0, 50);
    return ogrenciler
      .filter((o) =>
        [o.adSoyad, o.okulNo, o.sinif ?? ""].some((x) =>
          x.toLocaleLowerCase("tr-TR").includes(q),
        ),
      )
      .slice(0, 50);
  }, [ogrenciler, arama]);

  const guncelle = (i: number, alan: keyof DersGirdisi, deger: string) =>
    setGirdiler((g) => g.map((x, j) => (j === i ? { ...x, [alan]: deger } : x)));

  return (
    <form
      action={(f) =>
        calis(async () => {
          const s = await sonucKaydet(okulSlug, {
            examId,
            ogrenciId,
            puan: f.get("puan") ? Number(f.get("puan")) : null,
            siralama: f.get("siralama") ? Number(f.get("siralama")) : null,
            dersler: girdiler
              .filter((g) => g.subjectId)
              .map((g) => ({
                subjectId: g.subjectId,
                dogru: Number(g.dogru || 0),
                yanlis: Number(g.yanlis || 0),
                bos: Number(g.bos || 0),
              })),
          });
          if (s.basari) {
            setGirdiler([{ subjectId: "", dogru: "", yanlis: "", bos: "" }]);
            setOgrenciId("");
          }
          return s;
        })
      }
      className="space-y-3 rounded-kart border border-cizgi bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">
          Öğrenci ara
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Ad veya okul no"
            className="mt-1 block w-48 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Öğrenci
          <select
            required
            value={ogrenciId}
            onChange={(e) => setOgrenciId(e.target.value)}
            className="mt-1 block w-64 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
          >
            <option value="">Seçin…</option>
            {liste.map((o) => (
              <option key={o.id} value={o.id}>
                {o.adSoyad} · {o.okulNo}
                {o.sinif ? ` · ${o.sinif}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Puan
          <input
            name="puan"
            type="number"
            step="0.01"
            className="mt-1 block w-24 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Sıralama
          <input
            name="siralama"
            type="number"
            className="mt-1 block w-28 rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
      </div>

      <div className="space-y-2">
        {girdiler.map((g, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <select
              value={g.subjectId}
              onChange={(e) => guncelle(i, "subjectId", e.target.value)}
              className="w-40 rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Ders…</option>
              {dersler.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.ad}
                </option>
              ))}
            </select>
            {(["dogru", "yanlis", "bos"] as const).map((alan) => (
              <label key={alan} className="text-xs font-semibold text-soluk">
                {alan === "dogru" ? "Doğru" : alan === "yanlis" ? "Yanlış" : "Boş"}
                <input
                  type="number"
                  min={0}
                  value={g[alan]}
                  onChange={(e) => guncelle(i, alan, e.target.value)}
                  className="mt-0.5 block w-20 rounded-lg border border-cizgi px-2 py-1.5 text-sm font-normal text-ink"
                />
              </label>
            ))}
            {girdiler.length > 1 ? (
              <button
                type="button"
                onClick={() => setGirdiler((x) => x.filter((_, j) => j !== i))}
                className="rounded-lg border border-cizgi px-2.5 py-1.5 text-xs font-semibold hover:bg-zemin"
              >
                Çıkar
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setGirdiler((g) => [...g, { subjectId: "", dogru: "", yanlis: "", bos: "" }])
          }
          className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
        >
          + Ders ekle
        </button>
      </div>

      <p className="text-xs text-soluk">
        Net otomatik hesaplanır: doğru − yanlış/4. Aynı öğrenciye ikinci kez
        kaydederseniz önceki sonucun üzerine yazılır.
      </p>

      <button
        type="submit"
        disabled={bekliyor || !ogrenciId}
        className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
      >
        Kaydet
      </button>
    </form>
  );
}

function TopluGiris({
  okulSlug,
  examId,
  bekliyor,
  calis,
  sorunlar,
  setSorunlar,
}: {
  okulSlug: string;
  examId: string;
  bekliyor: boolean;
  calis: Calis;
  sorunlar: string[];
  setSorunlar: (s: string[]) => void;
}) {
  return (
    <form
      action={(f) =>
        calis(async () => {
          const s = await topluSonucKaydet(okulSlug, examId, String(f.get("metin") ?? ""));
          setSorunlar(s.sorunlar ?? []);
          return s;
        })
      }
      className="space-y-2 rounded-kart border border-cizgi bg-white p-4"
    >
      <p className="text-sm font-semibold">Excel&apos;den kopyalayıp yapıştırın</p>
      <p className="text-xs text-soluk">
        Sütun sırası: <b>okul no · ders · doğru · yanlış · boş</b>. Başlık satırı
        koymayın. Excel&apos;de hücreleri seçip kopyalamanız yeterli.
      </p>
      <textarea
        name="metin"
        required
        rows={8}
        placeholder={`220	Matematik	32	6	2
220	Türkçe	35	3	2
221	Matematik	28	10	2`}
        className="w-full rounded-lg border border-cizgi px-3 py-2 font-mono text-xs"
      />

      {sorunlar.length > 0 ? (
        <div className="rounded-kart border border-marka/30 bg-marka-acik p-3 text-xs text-marka-koyu">
          <p className="font-bold">Hiçbir satır kaydedilmedi. Önce şunları düzeltin:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {sorunlar.slice(0, 15).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {sorunlar.length > 15 ? (
            <p className="mt-1">…ve {sorunlar.length - 15} sorun daha.</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={bekliyor}
        className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
      >
        Yükle
      </button>
    </form>
  );
}
