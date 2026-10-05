"use client";

/**
 * "Çözemediğim sorular" ekranı — aynı bileşen iki rolü de karşılıyor.
 *
 * Öğrenci soruyu sorar ve kendi sorularını görür; öğretmen okulun sorularını
 * görür ve yanıtlar. Ayrım `rol` prop'uyla YALNIZCA görünümde; erişimi RLS
 * belirliyor, yani bileşene yanlış rol verilse bile kimse görmemesi gereken
 * bir soruyu göremez.
 */

import { useMemo, useState, useTransition } from "react";
import {
  DURUM_ADI,
  DURUM_SINIFI,
  soruSirala,
  type CozulemeyenSoru,
} from "@/lib/calisma/sorular-gorunum";
import { soruSor, soruyuKapat, yanitla } from "@/app/[okul]/sorular/actions";
import { GorselYukle } from "./gorsel-yukle";

interface Props {
  okulSlug: string;
  rol: "ogrenci" | "ogretmen";
  sorular: CozulemeyenSoru[];
  dersler: { id: string; ad: string }[];
  /** Görsel yolu için: {schoolId}/{ogrenciId}/... (bkz. 0020). */
  schoolId: string;
  /** Öğrenci ekranında kendisi; öğretmen ekranında yanıtladığı soruya göre. */
  kullaniciId: string;
}

export function SorularPaneli({
  okulSlug,
  rol,
  sorular: gelen,
  dersler,
  schoolId,
  kullaniciId,
}: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [yalnizBekleyen, setYalnizBekleyen] = useState(rol === "ogretmen");

  const liste = useMemo(() => {
    const sirali = soruSirala(gelen);
    return yalnizBekleyen ? sirali.filter((s) => s.durum === "bekliyor") : sirali;
  }, [gelen, yalnizBekleyen]);

  const bekleyen = gelen.filter((s) => s.durum === "bekliyor").length;

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
        <SoruFormu
          okulSlug={okulSlug}
          dersler={dersler}
          schoolId={schoolId}
          ogrenciId={kullaniciId}
          bekliyor={bekliyor}
          calis={calis}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setYalnizBekleyen(true)}
          className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
            yalnizBekleyen
              ? "border-lacivert bg-lacivert text-white"
              : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
          }`}
        >
          Bekleyenler <span className="ml-1 opacity-80">{bekleyen}</span>
        </button>
        <button
          type="button"
          onClick={() => setYalnizBekleyen(false)}
          className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
            !yalnizBekleyen
              ? "border-lacivert bg-lacivert text-white"
              : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
          }`}
        >
          Tümü <span className="ml-1 opacity-80">{gelen.length}</span>
        </button>
      </div>

      {liste.length === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          {yalnizBekleyen
            ? "Bekleyen soru yok."
            : rol === "ogrenci"
              ? "Henüz soru sormadın."
              : "Okulda kayıtlı soru yok."}
        </div>
      ) : (
        <ul className="space-y-3">
          {liste.map((s) => (
            <SoruKarti
              key={s.id}
              soru={s}
              rol={rol}
              okulSlug={okulSlug}
              schoolId={schoolId}
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

function SoruKarti({
  soru: s,
  rol,
  okulSlug,
  schoolId,
  bekliyor,
  calis,
}: {
  soru: CozulemeyenSoru;
  rol: "ogrenci" | "ogretmen";
  okulSlug: string;
  schoolId: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [yanitAcik, setYanitAcik] = useState(false);
  const [yanitMetni, setYanitMetni] = useState("");
  const [yanitGorseli, setYanitGorseli] = useState<string | null>(null);

  return (
    <li className="rounded-kart border border-cizgi bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">
          {rol === "ogretmen" ? (s.ogrenci ?? "Öğrenci") : (s.ders ?? "Genel")}
          {rol === "ogretmen" && s.sinif ? (
            <span className="ml-1 font-normal text-soluk">· {s.sinif}</span>
          ) : null}
        </span>
        <span
          className={`rounded-chip border px-2 py-0.5 text-[11px] font-bold ${DURUM_SINIFI[s.durum]}`}
        >
          {DURUM_ADI[s.durum]}
        </span>
      </div>

      {rol === "ogretmen" && s.ders ? (
        <div className="text-sm text-soluk">
          {s.ders}
          {s.konu ? ` · ${s.konu}` : ""}
          {s.hedefOgretmen ? ` · ${s.hedefOgretmen} için` : ""}
        </div>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm">{s.metin}</p>

      {s.gorselUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage
           adresi; next/image uzak alan yapılandırması gerektirir ve imza
           süresi dolduğunda önbellekte bozuk görsel bırakır */
        <img
          src={s.gorselUrl}
          alt="Soru fotoğrafı"
          className="mt-2 max-h-80 rounded-lg border border-cizgi"
        />
      ) : null}

      {s.yanitlar.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-cizgi pt-2">
          {s.yanitlar.map((y) => (
            <li key={y.id} className="rounded-lg bg-mavi-acik p-2.5">
              <div className="text-xs font-bold text-mavi-koyu">{y.ogretmen}</div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{y.metin}</p>
              {y.gorselUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={y.gorselUrl}
                  alt="Çözüm fotoğrafı"
                  className="mt-2 max-h-80 rounded-lg border border-cizgi"
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {rol === "ogretmen" ? (
          yanitAcik ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                calis(async () => {
                  const r = await yanitla(okulSlug, {
                    soruId: s.id,
                    metin: yanitMetni,
                    gorselYolu: yanitGorseli ?? "",
                  });
                  if (r.basari) {
                    setYanitMetni("");
                    setYanitGorseli(null);
                    setYanitAcik(false);
                  }
                  return r;
                });
              }}
              className="w-full space-y-2"
            >
              <textarea
                value={yanitMetni}
                onChange={(e) => setYanitMetni(e.target.value)}
                rows={3}
                required
                placeholder="Çözümü adım adım yaz — öğrenci bunu tek başına okuyacak."
                className="w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
              />
              {/* Çözüm görseli öğrencinin klasörüne yazılıyor: soru ve çözümü
                  bir arada dursun (bkz. 0020). */}
              <GorselYukle
                schoolId={schoolId}
                ogrenciId={s.ogrenciId}
                degisti={setYanitGorseli}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={bekliyor}
                  className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  Yanıtı Gönder
                </button>
                <button
                  type="button"
                  onClick={() => setYanitAcik(false)}
                  className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setYanitAcik(true)}
              className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
            >
              {s.yanitlar.length ? "Ek yanıt yaz" : "Yanıtla"}
            </button>
          )
        ) : s.durum !== "kapandi" ? (
          <button
            type="button"
            disabled={bekliyor}
            onClick={() => calis(() => soruyuKapat(okulSlug, s.id))}
            className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin disabled:opacity-60"
          >
            Anladım, kapat
          </button>
        ) : null}
      </div>
    </li>
  );
}

function SoruFormu({
  okulSlug,
  dersler,
  schoolId,
  ogrenciId,
  bekliyor,
  calis,
}: {
  okulSlug: string;
  dersler: { id: string; ad: string }[];
  schoolId: string;
  ogrenciId: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [acik, setAcik] = useState(false);
  const [anahtar, setAnahtar] = useState(0);
  const [gorsel, setGorsel] = useState<string | null>(null);

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="w-full rounded-kart border border-dashed border-cizgi bg-white py-3 text-sm font-semibold text-mavi hover:bg-zemin"
      >
        + Çözemediğim bir soru var
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
          const r = await soruSor(okulSlug, {
            metin: String(f.get("metin") ?? ""),
            dersId: String(f.get("dersId") ?? ""),
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
      <h2 className="text-sm font-bold">Çözemediğin soruyu yaz</h2>
      <label className="block text-sm font-semibold">
        Ders
        <select
          name="dersId"
          className="mt-1 block w-full max-w-xs rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        >
          <option value="">Seçilmedi</option>
          {dersler.map((d) => (
            <option key={d.id} value={d.id}>
              {d.ad}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Soru ve nerede takıldığın
        <textarea
          name="metin"
          rows={4}
          required
          placeholder="Soruyu yaz ve hangi adımda takıldığını anlat. Ne kadar açık yazarsan o kadar iyi yanıt alırsın."
          className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        />
      </label>
      {/* Fotoğraf çoğu zaman metinden daha anlatıcı: sorunun kendisini yazmak
          yerine çekip göndermek öğrenci için hem hızlı hem doğru. */}
      <GorselYukle schoolId={schoolId} ogrenciId={ogrenciId} degisti={setGorsel} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={bekliyor}
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
