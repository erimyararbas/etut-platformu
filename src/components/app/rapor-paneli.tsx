/**
 * Rapor tarih aralığı ve önizleme.
 *
 * Sunucu bileşeni: tarih aralığı adres satırında (`?baslangic=&bitis=`)
 * taşınıyor, bu yüzden istemci durumu gerekmiyor. Yan faydası, yöneticinin
 * bir aralığı yer imine ekleyebilmesi veya bağlantıyı paylaşabilmesi.
 */

import type { OgrenciOzeti } from "@/lib/rapor/katilim-ozet";

interface Props {
  okulSlug: string;
  baslangic: string;
  bitis: string;
  gecerliAralik: boolean;
  kayitSayisi: number;
  ozetler: OgrenciOzeti[];
}

export function RaporPaneli({
  okulSlug,
  baslangic,
  bitis,
  gecerliAralik,
  kayitSayisi,
  ozetler,
}: Props) {
  const indirmeAdresi = `/${okulSlug}/yonetim/raporlar/indir?baslangic=${baslangic}&bitis=${bitis}`;

  return (
    <div className="space-y-4">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-kart border border-cizgi bg-white p-4"
      >
        <label className="text-sm font-semibold">
          Başlangıç
          <input
            type="date"
            name="baslangic"
            defaultValue={baslangic}
            className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Bitiş
          <input
            type="date"
            name="bitis"
            defaultValue={bitis}
            className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-cizgi px-4 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Göster
        </button>
        {gecerliAralik && kayitSayisi > 0 ? (
          <a
            href={indirmeAdresi}
            className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu"
          >
            Excel indir
          </a>
        ) : null}
      </form>

      {!gecerliAralik ? (
        <div className="rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          Başlangıç tarihi bitişten sonra olamaz.
        </div>
      ) : kayitSayisi === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          Bu aralıkta yoklama kaydı yok. Yoklaması alınmamış etütler rapora girmez.
        </div>
      ) : (
        <>
          <p className="text-sm text-soluk">
            {ozetler.length} öğrenci · {kayitSayisi} yoklama kaydı
          </p>
          <div className="overflow-x-auto rounded-kart border border-cizgi bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-cizgi bg-zemin text-left text-xs uppercase text-soluk">
                <tr>
                  <th className="px-3 py-2 font-bold">Öğrenci</th>
                  <th className="px-3 py-2 font-bold">Sınıf</th>
                  <th className="px-3 py-2 font-bold">Katıldı</th>
                  <th className="px-3 py-2 font-bold">Devamsız</th>
                  <th className="px-3 py-2 font-bold">Mazeretli</th>
                  <th className="px-3 py-2 font-bold">Katılım</th>
                  <th className="px-3 py-2 font-bold">Ort. Yıldız</th>
                </tr>
              </thead>
              <tbody>
                {ozetler.map((o) => (
                  <tr key={o.okulNo} className="border-b border-cizgi last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{o.adSoyad}</div>
                      <div className="text-xs text-soluk">No {o.okulNo}</div>
                    </td>
                    <td className="px-3 py-2 text-soluk">{o.sinif ?? "—"}</td>
                    <td className="px-3 py-2 text-soluk">{o.katildi}</td>
                    <td
                      className={`px-3 py-2 ${o.devamsiz > 0 ? "font-semibold text-marka" : "text-soluk"}`}
                    >
                      {o.devamsiz}
                    </td>
                    <td className="px-3 py-2 text-soluk">{o.mazeretli}</td>
                    <td className="px-3 py-2 font-semibold">
                      {o.katilimYuzdesi === null ? "—" : `%${o.katilimYuzdesi}`}
                    </td>
                    <td className="px-3 py-2 text-soluk">{o.ortalamaYildiz ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-soluk">
            Katılım yüzdesi = katıldığı ÷ (katıldığı + devamsız olduğu). Mazeretli
            devamsızlık hesaba katılmaz.
          </p>
        </>
      )}
    </div>
  );
}
