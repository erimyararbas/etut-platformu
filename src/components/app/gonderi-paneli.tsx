"use client";

/**
 * Mentör onay kuyruğu — aynı bileşen iki rolü de karşılıyor.
 *
 * Öğrenci çalışmasının fotoğrafını gönderir ve kendi gönderilerini görür;
 * mentör kuyruğu görür ve karar verir. Erişimi RLS belirliyor (0022), `rol`
 * prop'u yalnızca görünümü değiştiriyor.
 */

import { useMemo, useState, useTransition } from "react";
import {
  GONDERI_DURUM_ADI,
  GONDERI_DURUM_SINIFI,
  GONDERI_SUZGECLERI,
  gonderiSirala,
  type Gonderi,
  type GonderiDurumu,
} from "@/lib/calisma/gonderi-gorunum";
import { gonderiYolla, kararVer } from "@/app/[okul]/gonderiler/actions";
import { GorselYukle } from "./gorsel-yukle";

interface Props {
  okulSlug: string;
  rol: "ogrenci" | "ogretmen";
  gonderiler: Gonderi[];
  schoolId: string;
  kullaniciId: string;
  /** Öğrencinin gönderisini bir hedefe bağlamak için. */
  hedefler: { id: string; baslik: string }[];
}

export function GonderiPaneli({
  okulSlug,
  rol,
  gonderiler: gelen,
  schoolId,
  kullaniciId,
  hedefler,
}: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [suzgec, setSuzgec] = useState<GonderiDurumu | "hepsi">(
    rol === "ogretmen" ? "bekliyor" : "hepsi",
  );

  const liste = useMemo(() => {
    const sirali = gonderiSirala(gelen);
    return suzgec === "hepsi" ? sirali : sirali.filter((g) => g.durum === suzgec);
  }, [gelen, suzgec]);

  const sayilar = useMemo(
    () => ({
      bekliyor: gelen.filter((g) => g.durum === "bekliyor").length,
      onaylandi: gelen.filter((g) => g.durum === "onaylandi").length,
      reddedildi: gelen.filter((g) => g.durum === "reddedildi").length,
    }),
    [gelen],
  );

  const calis = (islem: () => Promise<{ hata?: string; basari?: string }>) =>
    basla(async () => setSonuc(await islem()));

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

      {rol === "ogrenci" ? (
        <GonderiFormu
          okulSlug={okulSlug}
          schoolId={schoolId}
          ogrenciId={kullaniciId}
          hedefler={hedefler}
          bekliyor={bekliyor}
          calis={calis}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {GONDERI_SUZGECLERI.map((f) => (
          <button
            key={f.deger}
            type="button"
            onClick={() => setSuzgec(f.deger)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              suzgec === f.deger
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {f.etiket} <span className="ml-1 opacity-80">{sayilar[f.deger]}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSuzgec("hepsi")}
          className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
            suzgec === "hepsi"
              ? "border-lacivert bg-lacivert text-white"
              : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
          }`}
        >
          Tümü <span className="ml-1 opacity-80">{gelen.length}</span>
        </button>
      </div>

      {liste.length === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          Bu durumda gönderi yok.
        </div>
      ) : (
        <ul className="space-y-3">
          {liste.map((g) => (
            <GonderiKarti
              key={g.id}
              gonderi={g}
              rol={rol}
              okulSlug={okulSlug}
              bekliyor={bekliyor}
              calis={calis}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Calis = (islem: () => Promise<{ hata?: string; basari?: string }>) => void;

function GonderiKarti({
  gonderi: g,
  rol,
  okulSlug,
  bekliyor,
  calis,
}: {
  gonderi: Gonderi;
  rol: "ogrenci" | "ogretmen";
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [redAcik, setRedAcik] = useState(false);
  const [redNotu, setRedNotu] = useState("");

  return (
    <li className="rounded-kart border border-cizgi bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">
          {rol === "ogretmen" ? (g.ogrenci ?? "Öğrenci") : (g.hedef ?? "Serbest çalışma")}
          {rol === "ogretmen" && g.sinif ? (
            <span className="ml-1 font-normal text-soluk">· {g.sinif}</span>
          ) : null}
        </span>
        <span
          className={`rounded-chip border px-2 py-0.5 text-[11px] font-bold ${GONDERI_DURUM_SINIFI[g.durum]}`}
        >
          {GONDERI_DURUM_ADI[g.durum]}
        </span>
      </div>

      {rol === "ogretmen" && g.hedef ? (
        <div className="text-sm text-soluk">{g.hedef}</div>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm">{g.aciklama}</p>

      {g.gorselUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage
           adresi; next/image uzak alan yapılandırması ister ve imza süresi
           dolduğunda önbellekte bozuk görsel bırakır */
        <img
          src={g.gorselUrl}
          alt="Çalışma fotoğrafı"
          className="mt-2 max-h-96 rounded-lg border border-cizgi"
        />
      ) : (
        <p className="mt-2 text-sm text-soluk">Fotoğraf görüntülenemedi.</p>
      )}

      {g.durum !== "bekliyor" && g.kararVeren ? (
        <div
          className={`mt-2 rounded-lg p-2.5 text-sm ${
            g.durum === "onaylandi" ? "bg-basarili-acik" : "bg-marka-acik"
          }`}
        >
          <span className="font-bold">{g.kararVeren}</span>
          {g.kararNotu ? <p className="mt-0.5 whitespace-pre-wrap">{g.kararNotu}</p> : null}
        </div>
      ) : null}

      {rol === "ogretmen" && g.durum === "bekliyor" ? (
        <div className="mt-3 border-t border-cizgi pt-2">
          {redAcik ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                calis(async () => {
                  const r = await kararVer(okulSlug, {
                    gonderiId: g.id,
                    onay: false,
                    not: redNotu,
                  });
                  if (r.basari) {
                    setRedNotu("");
                    setRedAcik(false);
                  }
                  return r;
                });
              }}
              className="space-y-2"
            >
              <textarea
                value={redNotu}
                onChange={(e) => setRedNotu(e.target.value)}
                rows={2}
                required
                placeholder="Neyi düzeltmesi gerekiyor? Öğrenci bunu okuyacak."
                className="w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={bekliyor}
                  className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  Geri gönder
                </button>
                <button
                  type="button"
                  onClick={() => setRedAcik(false)}
                  className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bekliyor}
                onClick={() => calis(() => kararVer(okulSlug, { gonderiId: g.id, onay: true }))}
                className="rounded-lg bg-basarili px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Onayla
              </button>
              <button
                type="button"
                onClick={() => setRedAcik(true)}
                className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
              >
                Geri gönder
              </button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function GonderiFormu({
  okulSlug,
  schoolId,
  ogrenciId,
  hedefler,
  bekliyor,
  calis,
}: {
  okulSlug: string;
  schoolId: string;
  ogrenciId: string;
  hedefler: { id: string; baslik: string }[];
  bekliyor: boolean;
  calis: Calis;
}) {
  const [acik, setAcik] = useState(false);
  const [gorsel, setGorsel] = useState<string | null>(null);
  const [anahtar, setAnahtar] = useState(0);

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="w-full rounded-kart border border-dashed border-cizgi bg-white py-3 text-sm font-semibold text-mavi hover:bg-zemin"
      >
        + Çalışmamı mentörüme gönder
      </button>
    );
  }

  return (
    <form
      key={anahtar}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        calis(async () => {
          const r = await gonderiYolla(okulSlug, {
            aciklama: String(f.get("aciklama") ?? ""),
            hedefId: String(f.get("hedefId") ?? ""),
            gorselYolu: gorsel ?? "",
          });
          if (r.basari) {
            setGorsel(null);
            setAnahtar((a) => a + 1);
            setAcik(false);
          }
          return r;
        });
      }}
      className="space-y-3 rounded-kart border border-cizgi bg-white p-4"
    >
      <h2 className="text-sm font-bold">Çalışmanı gönder</h2>

      {hedefler.length > 0 ? (
        <label className="block text-sm font-semibold">
          Hangi hedef?
          <select
            name="hedefId"
            className="mt-1 block w-full max-w-xs rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
          >
            <option value="">Serbest çalışma</option>
            {hedefler.map((h) => (
              <option key={h.id} value={h.id}>
                {h.baslik}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-sm font-semibold">
        Ne çalıştın?
        <textarea
          name="aciklama"
          rows={2}
          required
          placeholder="Türev — 20 soru çözdüm, 3'ünde takıldım."
          className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        />
      </label>

      {/* Fotoğraf zorunlu: onay kuyruğunun tamamı fotoğrafı görmeye dayanıyor. */}
      <div>
        <span className="block text-sm font-semibold">Çalışmanın fotoğrafı</span>
        <div className="mt-1">
          <GorselYukle schoolId={schoolId} ogrenciId={ogrenciId} degisti={setGorsel} />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={bekliyor || !gorsel}
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Gönder
        </button>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="rounded-lg border border-cizgi px-4 py-2 text-sm font-semibold"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
