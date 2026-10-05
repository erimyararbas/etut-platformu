"use client";

/**
 * Raporun ekran araçları: tarih aralığı ve yazdırma.
 *
 * Tamamı `print:hidden` — çıktıda görünmemeli. Aralık adres satırında
 * taşındığı için burada durum yok; tek istemci ihtiyacı `window.print()`.
 */

import { useState } from "react";

interface Props {
  baslangic: string;
  bitis: string;
  geriYol: string;
}

export function RaporAraclari({ baslangic, bitis, geriYol }: Props) {
  const [yardim, setYardim] = useState(false);

  return (
    <div className="print:hidden">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-end gap-3 px-4 pt-4">
        <a
          href={geriYol}
          className="rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          ← Geri
        </a>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            Başlangıç
            <input
              type="date"
              name="baslangic"
              defaultValue={baslangic}
              className="mt-1 block rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            Bitiş
            <input
              type="date"
              name="bitis"
              defaultValue={bitis}
              className="mt-1 block rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-normal"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border border-cizgi bg-white px-4 py-2 text-sm font-semibold hover:bg-zemin"
          >
            Göster
          </button>
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu"
        >
          PDF olarak kaydet
        </button>

        <button
          type="button"
          onClick={() => setYardim((a) => !a)}
          aria-expanded={yardim}
          className="text-sm font-semibold text-mavi underline underline-offset-2"
        >
          Nasıl?
        </button>
      </div>

      {yardim ? (
        <div className="mx-auto mt-3 max-w-[210mm] px-4">
          <div className="rounded-kart border border-cizgi bg-white p-4 text-sm text-soluk">
            <p className="font-semibold text-ink">
              Rapor, tarayıcının yazdırma penceresinden PDF olarak kaydedilir.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Bilgisayar:</b> “PDF olarak kaydet” → açılan pencerede yazıcı
                yerine <b>“PDF olarak kaydet”</b> seçeneğini seçin.
              </li>
              <li>
                <b>iPhone / iPad:</b> Paylaş düğmesi → <b>Yazdır</b> → önizlemeyi
                iki parmakla açın → Paylaş → <b>Dosyalara Kaydet</b>.
              </li>
              <li>
                <b>Android:</b> “PDF olarak kaydet” → yazıcı listesinden{" "}
                <b>“PDF olarak kaydet”</b>.
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
