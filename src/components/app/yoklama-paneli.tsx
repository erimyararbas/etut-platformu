"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { tarihiYaz } from "@/lib/etut/kurallar";
import type { EtutKatilim, Katilimci, YoklamaDurumu } from "@/lib/etut/yoklama-gorunum";
import { HAZIR_YORUMLAR } from "@/lib/etut/yoklama-gorunum";
import type { IslemSonucu } from "@/app/[okul]/ogretmen/yoklama/actions";

interface Props {
  etut: EtutKatilim;
  yoklamaKaydet: (
    etutId: string,
    isaretler: Record<string, YoklamaDurumu>,
  ) => Promise<IslemSonucu>;
  degerlendir: (
    etutId: string,
    ogrenciId: string,
    yildiz: number,
    hazir: string[],
    yorum: string,
  ) => Promise<IslemSonucu>;
  iptalKarar: (etutId: string, ogrenciId: string, onay: boolean) => Promise<IslemSonucu>;
}

export function YoklamaPaneli({ etut, yoklamaKaydet, degerlendir, iptalKarar }: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<IslemSonucu | null>(null);

  // Kaydedilmemiş işaretler. Boşsa veritabanındaki değer geçerli.
  const [isaretler, setIsaretler] = useState<Record<string, YoklamaDurumu>>(() =>
    Object.fromEntries(
      etut.katilimcilar.filter((k) => k.yoklama).map((k) => [k.ogrenciId, k.yoklama!]),
    ),
  );
  const [acikOgrenci, setAcikOgrenci] = useState<string | null>(null);

  const isaretle = (ogrenciId: string, durum: YoklamaDurumu) => {
    setSonuc(null);
    setIsaretler((o) => ({ ...o, [ogrenciId]: durum }));
  };

  const hepsiKatildi = () => {
    setSonuc(null);
    setIsaretler(Object.fromEntries(etut.katilimcilar.map((k) => [k.ogrenciId, "katildi"])));
  };

  const kaydet = () =>
    basla(async () => setSonuc(await yoklamaKaydet(etut.id, isaretler)));

  const isaretliSayi = Object.keys(isaretler).length;
  const eksik = etut.katilimcilar.length - isaretliSayi;

  return (
    <div className="space-y-4">
      <div className="rounded-kart border border-cizgi bg-white p-4">
        <h2 className="font-bold leading-tight">
          {etut.ders}
          {etut.konu && <span className="font-normal text-soluk"> · {etut.konu}</span>}
        </h2>
        <p className="mt-0.5 text-sm text-soluk">
          {tarihiYaz(etut.tarih)} · {etut.baslangic}–{etut.bitis}
          {etut.derslik && ` · ${etut.derslik}`} · {etut.katilimcilar.length} öğrenci
        </p>

        {!etut.yoklamaAcik && (
          <p className="mt-3 rounded-md bg-uyari-acik px-3 py-2 text-sm text-ink-2">
            <strong>Yoklama kapalı.</strong> Yoklama etüt başladıktan sonra alınır ve
            bitiminden 24 saat sonra kilitlenir. Düzeltme için okul yönetimine başvurun.
          </p>
        )}
      </div>

      {etut.katilimcilar.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-8 text-center">
          <p className="font-semibold">Bu etüde kayıtlı öğrenci yok.</p>
        </div>
      ) : (
        <>
          {etut.yoklamaAcik && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" onClick={hepsiKatildi}>
                Hepsi katıldı
              </Button>
              <span className="text-sm text-soluk">
                {isaretliSayi}/{etut.katilimcilar.length} işaretlendi
                {eksik > 0 && ` · ${eksik} öğrenci boş`}
              </span>
            </div>
          )}

          <ul className="divide-y divide-cizgi overflow-hidden rounded-kart border border-cizgi bg-white">
            {etut.katilimcilar.map((k) => (
              <OgrenciSatiri
                key={k.ogrenciId}
                katilimci={k}
                etutId={etut.id}
                yoklamaAcik={etut.yoklamaAcik}
                secili={isaretler[k.ogrenciId] ?? null}
                isaretle={isaretle}
                acik={acikOgrenci === k.ogrenciId}
                setAcik={(a) => setAcikOgrenci(a ? k.ogrenciId : null)}
                degerlendir={degerlendir}
                iptalKarar={iptalKarar}
                disBekliyor={bekliyor}
              />
            ))}
          </ul>

          {sonuc?.basari && (
            <p role="status" className="rounded-md bg-basarili-acik px-3 py-2 text-sm text-basarili">
              {sonuc.basari}
            </p>
          )}
          {sonuc?.hata && (
            <p role="alert" className="rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
              {sonuc.hata}
            </p>
          )}

          {etut.yoklamaAcik && (
            <Button onClick={kaydet} disabled={bekliyor || isaretliSayi === 0}>
              {bekliyor ? "Kaydediliyor…" : "Yoklamayı Kaydet"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function OgrenciSatiri({
  katilimci: k,
  etutId,
  yoklamaAcik,
  secili,
  isaretle,
  acik,
  setAcik,
  degerlendir,
  iptalKarar,
  disBekliyor,
}: {
  katilimci: Katilimci;
  etutId: string;
  yoklamaAcik: boolean;
  secili: YoklamaDurumu | null;
  isaretle: (id: string, d: YoklamaDurumu) => void;
  acik: boolean;
  setAcik: (a: boolean) => void;
  degerlendir: Props["degerlendir"];
  iptalKarar: Props["iptalKarar"];
  disBekliyor: boolean;
}) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<IslemSonucu | null>(null);
  const [yildiz, setYildiz] = useState(k.yildiz ?? 0);
  const [hazir, setHazir] = useState<string[]>(k.hazirYorumlar);
  const [yorum, setYorum] = useState(k.yorum ?? "");

  const kaydet = () =>
    basla(async () => setSonuc(await degerlendir(etutId, k.ogrenciId, yildiz, hazir, yorum)));

  const karar = (onay: boolean) =>
    basla(async () => setSonuc(await iptalKarar(etutId, k.ogrenciId, onay)));

  const degerlendirildi = k.yildiz !== null;

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">
            {k.ad} {k.soyad}
          </div>
          <div className="text-xs text-soluk">
            {k.okulNo}
            {k.sinif && ` · ${k.sinif}`}
            {k.kayitDurumu === "atandi" && " · sınıf etüdü"}
          </div>
        </div>

        {yoklamaAcik ? (
          <div className="flex gap-1">
            {(
              [
                ["katildi", "Katıldı", "border-basarili bg-basarili-acik text-basarili"],
                ["mazeretli", "Mazeretli", "border-uyari bg-uyari-acik text-uyari"],
                ["devamsiz", "Devamsız", "border-marka bg-marka-acik text-marka-koyu"],
              ] as const
            ).map(([deger, etiket, aktifSinif]) => (
              <button
                key={deger}
                type="button"
                aria-pressed={secili === deger}
                onClick={() => isaretle(k.ogrenciId, deger)}
                className={`rounded-chip border px-2.5 py-1 text-xs font-semibold ${
                  secili === deger ? aktifSinif : "border-cizgi bg-white text-soluk"
                }`}
              >
                {etiket}
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-chip bg-zemin px-2.5 py-1 text-xs font-semibold text-soluk">
            {k.yoklama === "katildi"
              ? "Katıldı"
              : k.yoklama === "devamsiz"
                ? "Devamsız"
                : k.yoklama === "mazeretli"
                  ? "Mazeretli"
                  : "Yoklama alınmadı"}
          </span>
        )}

        <Button
          size="sm"
          variant={degerlendirildi ? "secondary" : "default"}
          onClick={() => setAcik(!acik)}
        >
          {degerlendirildi ? `${k.yildiz}★ Düzenle` : "Değerlendir"}
        </Button>
      </div>

      {k.iptalTalebi === "bekliyor" && (
        <div className="mt-3 rounded-lg border border-uyari/30 bg-uyari-acik p-3">
          <p className="text-sm">
            <strong>İptal talebi:</strong>{" "}
            {k.iptalNedeni || <span className="text-soluk">gerekçe yazılmamış</span>}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={bekliyor || disBekliyor} onClick={() => karar(true)}>
              Onayla, kaydı düşür
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={bekliyor || disBekliyor}
              onClick={() => karar(false)}
            >
              Reddet
            </Button>
          </div>
        </div>
      )}

      {acik && (
        <div className="mt-3 rounded-lg border border-cizgi bg-zemin p-3">
          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium">Yıldız puanı</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} yıldız`}
                  aria-pressed={yildiz === n}
                  onClick={() => setYildiz(n)}
                  className={`text-2xl leading-none ${
                    n <= yildiz ? "text-uyari" : "text-cizgi"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium">Hazır yorumlar</span>
            <div className="flex flex-wrap gap-1.5">
              {HAZIR_YORUMLAR.map((h) => {
                const s = hazir.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={s}
                    onClick={() =>
                      setHazir((l) => (s ? l.filter((x) => x !== h) : [...l, h]))
                    }
                    className={`rounded-chip border px-2.5 py-1 text-xs font-semibold ${
                      s ? "border-mavi bg-mavi-acik text-mavi" : "border-cizgi bg-white text-ink-2"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mb-1 block text-xs font-medium" htmlFor={`y-${k.ogrenciId}`}>
            Kendi yorumun (isteğe bağlı)
          </label>
          <textarea
            id={`y-${k.ogrenciId}`}
            rows={2}
            maxLength={1000}
            value={yorum}
            onChange={(e) => setYorum(e.target.value)}
            className="w-full rounded-md border border-cizgi bg-white px-3 py-2 text-sm"
          />

          <p className="mt-2 text-xs text-soluk">
            Yıldız ve yorumlar öğrenciye ve velisine görünür.
          </p>

          {sonuc?.basari && (
            <p role="status" className="mt-2 text-sm text-basarili">
              {sonuc.basari}
            </p>
          )}
          {sonuc?.hata && (
            <p role="alert" className="mt-2 text-sm text-marka-koyu">
              {sonuc.hata}
            </p>
          )}

          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={bekliyor || yildiz === 0} onClick={kaydet}>
              {bekliyor ? "Kaydediliyor…" : "Değerlendirmeyi Kaydet"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAcik(false)}>
              Kapat
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
