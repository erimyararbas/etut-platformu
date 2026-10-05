"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saatSecenekleri, tarihiYaz } from "@/lib/etut/kurallar";
import type { EtutOzeti } from "@/lib/etut/sorgular";
import type { OnayDurumu } from "@/app/[okul]/yonetim/onaylar/actions";

const SAATLER = saatSecenekleri();

interface Props {
  etut: EtutOzeti;
  konular: { id: string; ad: string; seviye: string }[];
  onayla: (durum: OnayDurumu, formData: FormData) => Promise<OnayDurumu>;
  reddet: (durum: OnayDurumu, formData: FormData) => Promise<OnayDurumu>;
}

export function OnayKarti({ etut, konular, onayla, reddet }: Props) {
  const [onayDurumu, onaylaEylem, onaylaniyor] = useActionState(onayla, {} as OnayDurumu);
  const [redDurumu, reddetEylem, reddediliyor] = useActionState(reddet, {} as OnayDurumu);
  const [redAcik, setRedAcik] = useState(false);

  const durum = onayDurumu.basari ? onayDurumu : redDurumu.basari ? redDurumu : null;

  if (durum?.basari) {
    return (
      <div className="rounded-kart border border-basarili/30 bg-basarili-acik p-4 text-sm">
        <strong>{etut.ders}</strong> · {tarihiYaz(etut.tarih)} — {durum.basari}
      </div>
    );
  }

  return (
    <article className="rounded-kart border border-cizgi bg-white p-4">
      <div className="mb-3">
        <h3 className="font-bold leading-tight">
          {etut.ders}
          {etut.konu && <span className="font-normal text-soluk"> · {etut.konu}</span>}
        </h3>
        <p className="mt-0.5 text-sm text-soluk">
          {etut.ogretmen} · {tarihiYaz(etut.tarih)}
          {etut.derslik && ` · ${etut.derslik}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-chip bg-mavi-acik px-2 py-0.5 font-semibold text-mavi">
            {etut.tur}
          </span>
          {etut.sinifEtuduMu && (
            <span className="rounded-chip bg-lacivert-acik px-2 py-0.5 font-semibold text-lacivert">
              Sınıf etüdü
            </span>
          )}
          {etut.uygunSiniflar.map((k) => (
            <span key={k} className="rounded-chip bg-zemin px-2 py-0.5 text-soluk">
              {k}
            </span>
          ))}
        </div>
        {etut.aciklama && <p className="mt-2 text-sm text-ink-2">{etut.aciklama}</p>}
      </div>

      {/* Onaylamadan önce düzenlenebilir alanlar — kaydedilen değer onaylanan değerdir. */}
      <form action={onaylaEylem} className="rounded-lg border border-cizgi bg-zemin p-3">
        <input type="hidden" name="etutId" value={etut.id} />
        <p className="mb-3 text-xs text-soluk">
          Onaylamadan önce düzeltebilirsiniz:
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`k-${etut.id}`} className="text-xs">
              Kontenjan
            </Label>
            <Input
              id={`k-${etut.id}`}
              name="kontenjan"
              type="number"
              min={1}
              max={500}
              defaultValue={etut.kontenjan}
              disabled={etut.sinifEtuduMu}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`b-${etut.id}`} className="text-xs">
              Başlangıç
            </Label>
            <select
              id={`b-${etut.id}`}
              name="baslangic"
              defaultValue={etut.baslangic}
              className="h-9 w-full rounded-md border border-cizgi bg-white px-2 text-sm"
            >
              {SAATLER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`s-${etut.id}`} className="text-xs">
              Bitiş
            </Label>
            <select
              id={`s-${etut.id}`}
              name="bitis"
              defaultValue={etut.bitis}
              className="h-9 w-full rounded-md border border-cizgi bg-white px-2 text-sm"
            >
              {SAATLER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`kn-${etut.id}`} className="text-xs">
              Konu
            </Label>
            <select
              id={`kn-${etut.id}`}
              name="konuId"
              defaultValue=""
              className="h-9 w-full rounded-md border border-cizgi bg-white px-2 text-sm"
            >
              <option value="">Değiştirme</option>
              {konular.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.seviye} · {k.ad}
                </option>
              ))}
            </select>
          </div>
        </div>

        {etut.sinifEtuduMu && (
          <p className="mt-2 text-xs text-soluk">
            Sınıf etüdünde kontenjan seçilen sınıfların mevcuduna eşittir, değiştirilemez.
          </p>
        )}

        {onayDurumu.hata && (
          <p role="alert" className="mt-3 rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
            {onayDurumu.hata}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={onaylaniyor}>
            {onaylaniyor ? "Onaylanıyor…" : "Düzenle ve Onayla"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setRedAcik((a) => !a)}
          >
            Reddet
          </Button>
        </div>
      </form>

      {redAcik && (
        <form action={reddetEylem} className="mt-3 rounded-lg border border-marka/30 bg-marka-acik p-3">
          <input type="hidden" name="etutId" value={etut.id} />
          <Label htmlFor={`r-${etut.id}`} className="text-xs">
            Red nedeni
          </Label>
          <textarea
            id={`r-${etut.id}`}
            name="neden"
            rows={2}
            required
            minLength={3}
            placeholder="Aynı saatte deneme sınavı var, lütfen bir saat sonraya alın."
            className="mt-1 w-full rounded-md border border-cizgi bg-white px-3 py-2 text-sm"
          />
          {redDurumu.hata && (
            <p role="alert" className="mt-2 text-sm text-marka-koyu">
              {redDurumu.hata}
            </p>
          )}
          <Button type="submit" size="sm" variant="destructive" className="mt-2" disabled={reddediliyor}>
            {reddediliyor ? "Gönderiliyor…" : "Reddet ve Bildir"}
          </Button>
        </form>
      )}
    </article>
  );
}
