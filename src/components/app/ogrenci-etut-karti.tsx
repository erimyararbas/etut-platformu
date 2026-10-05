"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { tarihiYaz } from "@/lib/etut/kurallar";
// İstemci bileşeni SUNUCU modülünden import etmemeli; saf görünüm modülü ayrı.
import { eylemBelirle, type OgrenciEtut } from "@/lib/etut/ogrenci-gorunum";
import type { RezervasyonDurumuSonuc } from "@/app/[okul]/ogrenci/actions";

interface Props {
  etut: OgrenciEtut;
  katil: (etutId: string) => Promise<RezervasyonDurumuSonuc>;
  birak: (etutId: string) => Promise<RezervasyonDurumuSonuc>;
  iptalTalebi: (etutId: string, neden: string) => Promise<RezervasyonDurumuSonuc>;
}

export function OgrenciEtutKarti({ etut, katil, birak, iptalTalebi }: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<RezervasyonDurumuSonuc | null>(null);
  const [talepAcik, setTalepAcik] = useState(false);
  const [neden, setNeden] = useState("");

  const eylem = eylemBelirle(etut);
  const oran = etut.kontenjan > 0 ? Math.min(etut.dolu / etut.kontenjan, 1) : 0;
  const barRenk =
    etut.dolu >= etut.kontenjan
      ? "bg-doluluk-dolu"
      : oran >= 0.8
        ? "bg-doluluk-yakin"
        : "bg-doluluk-normal";

  const calistir = (fn: () => Promise<RezervasyonDurumuSonuc>) =>
    basla(async () => setSonuc(await fn()));

  const kayitli = etut.benimDurumum === "rezerve" || etut.benimDurumum === "atandi";

  return (
    <article
      className={`rounded-kart border bg-white p-4 ${
        kayitli ? "border-basarili/40" : "border-cizgi"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">
            {etut.ders}
            {etut.konu && <span className="font-normal text-soluk"> · {etut.konu}</span>}
          </h3>
          <p className="mt-0.5 text-sm text-soluk">
            {tarihiYaz(etut.tarih)} · {etut.baslangic}–{etut.bitis} · {etut.ogretmen}
            {etut.derslik && ` · ${etut.derslik}`}
          </p>
        </div>
        {kayitli && (
          <span className="rounded-chip bg-basarili-acik px-2 py-1 text-xs font-bold text-basarili">
            {etut.benimDurumum === "atandi" ? "Atandın" : "Kayıtlısın"}
          </span>
        )}
        {etut.benimDurumum === "beklemede" && (
          <span className="rounded-chip bg-uyari-acik px-2 py-1 text-xs font-bold text-uyari">
            Sırada {etut.benimSiram}.
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-chip bg-mavi-acik px-2 py-0.5 font-semibold text-mavi">
          {etut.tur}
        </span>
        {etut.sinifEtuduMu && (
          <span className="rounded-chip bg-lacivert-acik px-2 py-0.5 font-semibold text-lacivert">
            Sınıf etüdü · katılım zorunlu
          </span>
        )}
      </div>

      {etut.aciklama && <p className="mb-3 text-sm text-ink-2">{etut.aciklama}</p>}

      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-soluk">Kontenjan</span>
          <span className="font-semibold tabular-nums">
            {etut.dolu}/{etut.kontenjan}
            <span className="ml-1 font-normal text-soluk">
              {etut.dolu >= etut.kontenjan
                ? `dolu · ${etut.bekleyen} kişi sırada`
                : `${etut.kontenjan - etut.dolu} yer kaldı`}
            </span>
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-zemin"
          role="img"
          aria-label={`Kontenjan ${etut.dolu} / ${etut.kontenjan}`}
        >
          <div className={`h-full rounded-full ${barRenk}`} style={{ width: `${oran * 100}%` }} />
        </div>
      </div>

      {eylem.not && !sonuc && <p className="mb-2 text-xs text-soluk">{eylem.not}</p>}

      {sonuc?.basari && (
        <p role="status" className="mb-2 rounded-md bg-basarili-acik px-3 py-2 text-sm text-basarili">
          {sonuc.basari}
        </p>
      )}
      {sonuc?.hata && (
        <p role="alert" className="mb-2 rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
          {sonuc.hata}
        </p>
      )}

      {eylem.tur === "rezerve_et" && (
        <Button size="sm" disabled={bekliyor} onClick={() => calistir(() => katil(etut.id))}>
          {bekliyor ? "Kaydediliyor…" : eylem.etiket}
        </Button>
      )}

      {eylem.tur === "siraya_gir" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={bekliyor}
          onClick={() => calistir(() => katil(etut.id))}
        >
          {bekliyor ? "Kaydediliyor…" : eylem.etiket}
        </Button>
      )}

      {(eylem.tur === "birak" || eylem.tur === "siradan_cik") && (
        <Button
          size="sm"
          variant="secondary"
          disabled={bekliyor}
          onClick={() => calistir(() => birak(etut.id))}
        >
          {bekliyor ? "İptal ediliyor…" : eylem.etiket}
        </Button>
      )}

      {eylem.tur === "iptal_talebi" &&
        (talepAcik ? (
          <div className="rounded-lg border border-cizgi bg-zemin p-3">
            <label htmlFor={`n-${etut.id}`} className="mb-1 block text-xs font-medium">
              Neden katılamıyorsun?
            </label>
            <textarea
              id={`n-${etut.id}`}
              rows={2}
              value={neden}
              onChange={(e) => setNeden(e.target.value)}
              placeholder="Doktor randevum var."
              className="w-full rounded-md border border-cizgi bg-white px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={bekliyor}
                onClick={() => calistir(() => iptalTalebi(etut.id, neden))}
              >
                {bekliyor ? "Gönderiliyor…" : "Talebi Gönder"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTalepAcik(false)}>
                Vazgeç
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setTalepAcik(true)}>
            {eylem.etiket}
          </Button>
        ))}

      {(eylem.tur === "kapali" || eylem.tur === "cakisma" || eylem.tur === "talep_beklemede") && (
        <span className="inline-block rounded-md bg-zemin px-3 py-1.5 text-sm font-semibold text-soluk">
          {eylem.etiket}
        </span>
      )}
    </article>
  );
}
