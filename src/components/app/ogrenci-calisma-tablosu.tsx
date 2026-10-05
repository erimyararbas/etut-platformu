"use client";

/**
 * Öğretmenin öğrenci çalışma takibi.
 *
 * Varsayılan sıralama "Hiç çalışmayanlar" DEĞİL ama o ölçüt listenin başında
 * duruyor: öğretmenin bu ekrandan çıkarması gereken asıl bilgi kimin çok soru
 * çözdüğü değil, kimin hiç çözmediği.
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  SIRALAMALAR,
  sirala,
  sonCalismaMetni,
  type OgrenciCalismasi,
  type SiralamaOlcutu,
} from "@/lib/calisma/ogretmen-gorunum";
import { sureMetni } from "@/lib/calisma/gorunum";
import { hedefAta } from "@/app/[okul]/ogretmen/calisma/actions";

interface Props {
  okulSlug: string;
  ogrenciler: OgrenciCalismasi[];
  bugun: string;
  /** Hedef atarken seçilebilecek dersler. */
  dersler: { id: string; ad: string }[];
}

function kucult(s: string) {
  return s.toLocaleLowerCase("tr-TR");
}

export function OgrenciCalismaTablosu({ okulSlug, ogrenciler, bugun, dersler }: Props) {
  const [olcut, setOlcut] = useState<SiralamaOlcutu>("sinif");
  const [arama, setArama] = useState("");
  const [hedefIcin, setHedefIcin] = useState<OgrenciCalismasi | null>(null);
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});
  const [bekliyor, basla] = useTransition();

  const liste = useMemo(() => {
    const q = kucult(arama.trim());
    const sirali = sirala(ogrenciler, olcut);
    if (!q) return sirali;
    return sirali.filter((o) =>
      [o.adSoyad, o.okulNo, o.sinif]
        .filter((x): x is string => Boolean(x))
        .some((x) => kucult(x).includes(q)),
    );
  }, [ogrenciler, olcut, arama]);

  const calismayan = ogrenciler.filter((o) => o.soru === 0).length;

  return (
    <div className="space-y-4">
      {calismayan > 0 ? (
        <div className="rounded-kart border border-uyari/30 bg-uyari-acik p-3 text-sm">
          <span className="font-bold">{calismayan} öğrenci</span> bu aralıkta hiç soru
          çözmemiş.{" "}
          <button
            type="button"
            onClick={() => setOlcut("calismayan")}
            className="font-semibold underline"
          >
            Listele
          </button>
        </div>
      ) : null}

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

      <div className="flex flex-wrap items-center gap-2">
        {SIRALAMALAR.map((s) => (
          <button
            key={s.deger}
            type="button"
            onClick={() => setOlcut(s.deger)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              olcut === s.deger
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {s.etiket}
          </button>
        ))}
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Ad, okul no, sınıf ara"
          className="ml-auto w-full rounded-lg border border-cizgi px-3 py-1.5 text-sm sm:w-56"
        />
      </div>

      {hedefIcin ? (
        <HedefAtamaFormu
          okulSlug={okulSlug}
          ogrenci={hedefIcin}
          dersler={dersler}
          bekliyor={bekliyor}
          kapat={() => setHedefIcin(null)}
          calis={(islem) =>
            basla(async () => {
              const s = await islem();
              setSonuc(s);
              if (s.basari) setHedefIcin(null);
            })
          }
        />
      ) : null}

      {liste.length === 0 ? (
        <div className="rounded-kart border border-cizgi bg-white p-8 text-center text-sm text-soluk">
          {olcut === "calismayan"
            ? "Herkes bu aralıkta çalışmış."
            : "Bu süzgece uyan öğrenci yok."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-kart border border-cizgi bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-cizgi bg-zemin text-left text-xs uppercase text-soluk">
              <tr>
                <th className="px-3 py-2 font-bold">Öğrenci</th>
                <th className="px-3 py-2 font-bold">Sınıf</th>
                <th className="px-3 py-2 font-bold">Soru</th>
                <th className="px-3 py-2 font-bold">Net</th>
                <th className="px-3 py-2 font-bold">Süre</th>
                <th className="px-3 py-2 font-bold">Son çalışma</th>
                <th className="px-3 py-2 font-bold">Hedef</th>
                <th className="px-3 py-2 text-right font-bold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((o) => (
                <tr key={o.ogrenciId} className="border-b border-cizgi last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{o.adSoyad}</div>
                    <div className="text-xs text-soluk">No {o.okulNo}</div>
                  </td>
                  <td className="px-3 py-2 text-soluk">{o.sinif ?? "—"}</td>
                  <td
                    className={`px-3 py-2 ${o.soru === 0 ? "font-semibold text-marka" : "text-soluk"}`}
                  >
                    {o.soru}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{o.net}</td>
                  <td className="px-3 py-2 text-soluk">{sureMetni(o.sureSaniye)}</td>
                  <td className="px-3 py-2 text-soluk">
                    {sonCalismaMetni(o.sonCalisma, bugun)}
                  </td>
                  <td className="px-3 py-2 text-soluk">{o.aktifHedef}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setHedefIcin(o);
                          setSonuc({});
                        }}
                        className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin"
                      >
                        Hedef ver
                      </button>
                      {/* Bu tablo yalnızca çalışma sayılarını gösteriyor;
                          rapor öğrencinin etüt katılımını ve değerlendirmelerini
                          de içeriyor — veli görüşmesinden önce bakılacak yer. */}
                      {/* Plan yazma yetkisi RLS'te: yalnızca öğrencinin
                          mentörü ve rehber. Düğme herkese görünüyor ama
                          yetkisiz kullanıcı formu kaydedemez ve nedenini
                          okur — yetkiyi burada tahmin etmeye çalışmak,
                          RLS'in kuralını ikinci kez yazmak olurdu. */}
                      <Link
                        href={`/${okulSlug}/plan/${o.ogrenciId}`}
                        className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin"
                      >
                        Plan
                      </Link>
                      <Link
                        href={`/${okulSlug}/rapor/${o.ogrenciId}`}
                        className="whitespace-nowrap rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin"
                      >
                        Rapor
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HedefAtamaFormu({
  okulSlug,
  ogrenci,
  dersler,
  bekliyor,
  kapat,
  calis,
}: {
  okulSlug: string;
  ogrenci: OgrenciCalismasi;
  dersler: { id: string; ad: string }[];
  bekliyor: boolean;
  kapat: () => void;
  calis: (islem: () => Promise<{ hata?: string; basari?: string }>) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        calis(() =>
          hedefAta(okulSlug, {
            ogrenciId: ogrenci.ogrenciId,
            baslik: String(f.get("baslik") ?? ""),
            hedefSoru: String(f.get("hedefSoru") ?? ""),
            dersId: String(f.get("dersId") ?? ""),
            sonTarih: String(f.get("sonTarih") ?? ""),
          }),
        );
      }}
      className="space-y-3 rounded-kart border border-mavi/30 bg-mavi-acik p-4"
    >
      <h2 className="text-sm font-bold text-mavi-koyu">
        {ogrenci.adSoyad} için hedef
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Hedef
          <input
            name="baslik"
            required
            placeholder="Türev — zincir kuralı"
            className="mt-1 block w-full rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Ders
          <select
            name="dersId"
            className="mt-1 block w-full rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Seçilmedi</option>
            {dersler.map((d) => (
              <option key={d.id} value={d.id}>
                {d.ad}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Kaç soru?
          <input
            name="hedefSoru"
            type="number"
            min={1}
            defaultValue={30}
            className="mt-1 block w-28 rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Son tarih
          <input
            name="sonTarih"
            type="date"
            className="mt-1 block rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={bekliyor}
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {bekliyor ? "Atanıyor…" : "Hedefi Ata"}
        </button>
        <button
          type="button"
          onClick={kapat}
          className="rounded-lg border border-cizgi bg-white px-4 py-2 text-sm font-semibold"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
