/**
 * Öğrencinin deneme sonuçları — öğrenci ve veli ekranlarında aynı bileşen.
 *
 * Sunucu bileşeni: hiçbir etkileşim yok, yalnızca gösterim. İkisine ayrı
 * bileşen yazmak, birinin güncellenip diğerinin unutulmasıyla veliyle
 * öğrencinin farklı net görmesine giderdi.
 *
 * TEK ÖLÇÜ: çubuklar yalnızca NET gösterir. Doğru/yanlış/boş sayıları tabloda
 * duruyor; üçünü de çubuğa koymak, karşılaştırılamayan büyüklükleri aynı
 * eksende yan yana getirmek olurdu.
 */

import type { DenemeSonucu } from "@/lib/deneme/gorunum";
import { netGelisimi, sonDegisim, tarihKisa } from "@/lib/deneme/gorunum";

interface Props {
  sonuclar: DenemeSonucu[];
  /** Başlığın altındaki açıklama; veli ve öğrenci için farklı. */
  aciklama?: string;
}

export function DenemeOzeti({ sonuclar, aciklama }: Props) {
  if (sonuclar.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
          Denemeler
        </h2>
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-6 text-center text-sm text-soluk">
          Henüz deneme sonucu girilmemiş.
        </div>
      </section>
    );
  }

  const seri = netGelisimi(sonuclar);
  const enYuksek = Math.max(1, ...seri.map((s) => s.net));
  const degisim = sonDegisim(sonuclar);
  const son = sonuclar[0];

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
        Denemeler
      </h2>
      {aciklama ? <p className="mb-2 text-xs text-soluk">{aciklama}</p> : null}

      <div className="rounded-kart border border-cizgi bg-white p-4">
        {/* Son deneme özeti */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase text-soluk">Son deneme</div>
            <div className="font-bold">
              {son.ad}
              <span className="ml-2 font-normal text-soluk">{tarihKisa(son.tarih)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-lacivert tabular-nums">
              {son.toplamNet}
            </div>
            <div className="text-xs text-soluk">
              net
              {degisim !== null ? (
                <span
                  className={
                    degisim > 0
                      ? "ml-1 font-bold text-basarili"
                      : degisim < 0
                        ? "ml-1 font-bold text-marka"
                        : "ml-1"
                  }
                >
                  {degisim > 0 ? "+" : ""}
                  {degisim}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Net gelişimi — eskiden yeniye */}
        {seri.length > 1 ? (
          <div className="mt-4 space-y-1.5">
            {seri.map((d) => (
              <div key={`${d.tarih}-${d.ad}`} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 truncate text-soluk">{d.ad}</span>
                <div className="h-2.5 flex-1 rounded-full bg-zemin">
                  <div
                    className="h-2.5 rounded-full bg-mavi"
                    style={{ width: `${Math.round((d.net / enYuksek) * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                  {d.net}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Ders kırılımı — son deneme */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[360px] text-xs">
            <thead className="border-b border-cizgi text-left uppercase text-soluk">
              <tr>
                <th className="py-1.5 font-bold">Ders</th>
                <th className="py-1.5 font-bold">D</th>
                <th className="py-1.5 font-bold">Y</th>
                <th className="py-1.5 font-bold">B</th>
                <th className="py-1.5 text-right font-bold">Net</th>
              </tr>
            </thead>
            <tbody>
              {son.dersler.map((d) => (
                <tr key={d.subjectId} className="border-b border-cizgi last:border-0">
                  <td className="py-1.5 font-semibold">{d.ders}</td>
                  <td className="py-1.5 tabular-nums text-soluk">{d.dogru}</td>
                  <td className="py-1.5 tabular-nums text-soluk">{d.yanlis}</td>
                  <td className="py-1.5 tabular-nums text-soluk">{d.bos}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">{d.net}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {son.puan !== null || son.siralama !== null ? (
          <p className="mt-2 text-xs text-soluk">
            {son.puan !== null ? `Puan ${son.puan}` : ""}
            {son.puan !== null && son.siralama !== null ? " · " : ""}
            {son.siralama !== null ? `Sıralama ${son.siralama.toLocaleString("tr-TR")}` : ""}
          </p>
        ) : null}

        <p className="mt-2 text-[11px] text-soluk">
          Net = doğru − yanlış/4. Toplam {sonuclar.length} deneme kayıtlı.
        </p>
      </div>
    </section>
  );
}
