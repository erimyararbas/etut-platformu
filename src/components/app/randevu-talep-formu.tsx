"use client";

/**
 * Veli/öğrenci randevu talebi.
 *
 * Talep açmak randevu OLUŞTURMAK değil: zamanı rehber belirler (0023'teki
 * politika veliyi 'talep' durumuyla sınırlıyor). Form bunu açıkça söylüyor ki
 * veli "randevum var" sanmasın.
 */

import { useState, useTransition } from "react";
import { randevuTalepEt } from "@/app/[okul]/rehberlik/actions";
import {
  RANDEVU_DURUM_ADI,
  RANDEVU_TUR_ADI,
  type Randevu,
} from "@/lib/rehberlik/gorunum";

interface Props {
  okulSlug: string;
  ogrenciId: string;
  randevular: Randevu[];
}

export function RandevuTalepFormu({ okulSlug, ogrenciId, randevular }: Props) {
  const [acik, setAcik] = useState(false);
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [anahtar, setAnahtar] = useState(0);

  const aktif = randevular.filter((r) => r.durum !== "iptal" && r.durum !== "tamamlandi");

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
        Rehberlik
      </h2>

      {sonuc.hata ? (
        <div className="mb-2 rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          {sonuc.hata}
        </div>
      ) : null}
      {sonuc.basari ? (
        <div className="mb-2 rounded-kart border border-basarili/30 bg-basarili-acik p-3 text-sm font-semibold text-basarili">
          {sonuc.basari}
        </div>
      ) : null}

      {aktif.length > 0 ? (
        <ul className="mb-2 space-y-2">
          {aktif.map((r) => (
            <li key={r.id} className="rounded-kart border border-cizgi bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{RANDEVU_TUR_ADI[r.tur]}</span>
                <span className="rounded-chip border border-cizgi bg-zemin px-2 py-0.5 text-[11px] font-bold text-soluk">
                  {RANDEVU_DURUM_ADI[r.durum]}
                </span>
              </div>
              <div className="text-sm text-soluk">
                {r.tarih
                  ? `${r.tarih}${r.baslangic ? ` · ${r.baslangic}` : ""}`
                  : "Rehberlik servisi zamanı belirleyecek."}
              </div>
              {r.talepNotu ? <p className="mt-1 text-sm">{r.talepNotu}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {acik ? (
        <form
          key={anahtar}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            basla(async () => {
              const r = await randevuTalepEt(
                okulSlug,
                ogrenciId,
                String(f.get("not") ?? ""),
              );
              setSonuc(r);
              if (r.basari) {
                setAnahtar((a) => a + 1);
                setAcik(false);
              }
            });
          }}
          className="space-y-3 rounded-kart border border-cizgi bg-white p-4"
        >
          <p className="text-sm text-soluk">
            Talebiniz rehberlik servisine iletilir; görüşme saatini onlar belirler ve
            size bildirir.
          </p>
          <textarea
            name="not"
            rows={3}
            required
            placeholder="Hangi konuda görüşmek istiyorsunuz?"
            className="w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={bekliyor}
              className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              Talebi Gönder
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
      ) : (
        <button
          type="button"
          onClick={() => setAcik(true)}
          className="w-full rounded-kart border border-dashed border-cizgi bg-white py-3 text-sm font-semibold text-mavi hover:bg-zemin"
        >
          + Rehberlik görüşmesi talep et
        </button>
      )}
    </section>
  );
}
