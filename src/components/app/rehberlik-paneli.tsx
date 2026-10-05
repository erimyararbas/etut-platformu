"use client";

/**
 * Rehberlik servisi paneli: risk kuyruğu, randevu talepleri, vakalar.
 *
 * Ekranın tepesindeki gizlilik uyarısı süs değil: bu panelde görünen her şey
 * okul yönetiminin bile göremediği veri (0023). Uyarı, ekranı birinin omzunun
 * üzerinden gören için de orada.
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  ONCELIK_ADI,
  ONCELIK_SINIFI,
  RANDEVU_DURUM_ADI,
  RANDEVU_TUR_ADI,
  VAKA_DURUM_ADI,
  gorunurlukMetni,
  riskBandi,
  type GorusmeNotu,
  type Randevu,
  type RiskKaydi,
  type Vaka,
} from "@/lib/rehberlik/gorunum";
import {
  notEkle,
  randevuPlanla,
  randevuReddet,
  vakaAc,
  vakaDurumu,
} from "@/app/[okul]/rehberlik/actions";
import { DenemeBolumu } from "@/components/app/deneme-bolumu";
import { TalepKuyrugu } from "@/components/app/talep-kuyrugu";
import type { EtutTalebi } from "@/lib/etut/talep-gorunum";
import type { Deneme, DenemeOgrenciSatiri } from "@/lib/deneme/gorunum";
import type { DizinDersi, DizinOgrencisi } from "@/lib/rehberlik/dizin";

type Sekme = "bugun" | "vakalar" | "randevular" | "denemeler" | "talepler";

interface Props {
  okulSlug: string;
  bugun: string;
  risk: RiskKaydi[];
  vakalar: Vaka[];
  randevular: Randevu[];
  /** Seçili vakanın notları; vaka seçili değilse boş. */
  notlar: GorusmeNotu[];
  seciliVaka: string | null;
  /**
   * Deneme sınavları. REHBERLİK VERİSİ DEĞİL (0027): yönetici ve öğretmen de
   * görür. Aynı panelde durmalarının sebebi girişi rehberin yapması.
   */
  denemeler: Deneme[];
  seciliDeneme: string | null;
  denemeSonuclari: DenemeOgrenciSatiri[];
  ogrenciler: DizinOgrencisi[];
  dersler: DizinDersi[];
  /** Öğrencilerin açtığı etüt talepleri (0030). */
  etutTalepleri: EtutTalebi[];
}

export function RehberlikPaneli({
  okulSlug,
  bugun,
  risk,
  vakalar: vakaListesi,
  randevular: randevuListesi,
  notlar,
  seciliVaka,
  denemeler,
  seciliDeneme,
  denemeSonuclari,
  ogrenciler,
  dersler,
  etutTalepleri,
}: Props) {
  const [sekme, setSekme] = useState<Sekme>("bugun");
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});

  const calis = (islem: () => Promise<{ hata?: string; basari?: string }>) =>
    basla(async () => setSonuc(await islem()));

  const talepler = useMemo(
    () => randevuListesi.filter((r) => r.durum === "talep"),
    [randevuListesi],
  );
  const bugunkuler = useMemo(
    () => randevuListesi.filter((r) => r.tarih === bugun && r.durum !== "iptal"),
    [randevuListesi, bugun],
  );
  const acikVakalar = useMemo(
    () => vakaListesi.filter((v) => v.durum !== "kapandi"),
    [vakaListesi],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-kart border border-lacivert/20 bg-lacivert px-4 py-3 text-white">
        <div className="text-sm font-extrabold">Rehberlik Servisi</div>
        <p className="text-sm opacity-85">
          Buradaki kayıtlar gizlidir — okul yönetimi ve öğretmenler göremez.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kutu deger={risk.length} etiket="Uyarı kuyruğu" />
        <Kutu
          deger={risk.filter((r) => r.skor >= 60).length}
          etiket="Öncelikli"
          renk={risk.some((r) => r.skor >= 60) ? "text-marka" : undefined}
        />
        <Kutu deger={talepler.length} etiket="Bekleyen talep" />
        <Kutu deger={acikVakalar.length} etiket="Açık vaka" />
      </div>

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

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["bugun", "Bugün"],
            ["vakalar", `Vakalar (${acikVakalar.length})`],
            ["randevular", `Randevular (${talepler.length})`],
            ["denemeler", `Denemeler (${denemeler.length})`],
            [
              "talepler",
              `Etüt talepleri (${etutTalepleri.filter((t) => t.durum === "bekliyor").length})`,
            ],
          ] as const
        ).map(([deger, etiket]) => (
          <button
            key={deger}
            type="button"
            onClick={() => setSekme(deger)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              sekme === deger
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {etiket}
          </button>
        ))}
      </div>

      {sekme === "bugun" ? (
        <>
          <RiskKuyrugu
            risk={risk}
            okulSlug={okulSlug}
            bekliyor={bekliyor}
            calis={calis}
          />
          <RandevuTalepleri
            talepler={talepler}
            bugun={bugun}
            okulSlug={okulSlug}
            bekliyor={bekliyor}
            calis={calis}
          />
          <section>
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
              Bugünkü randevular ({bugunkuler.length})
            </h2>
            {bugunkuler.length === 0 ? (
              <Bos>Bugün planlanmış randevu yok.</Bos>
            ) : (
              <ul className="space-y-2">
                {bugunkuler.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-kart border border-cizgi bg-white p-3"
                  >
                    <div>
                      <div className="font-semibold">
                        {r.ogrenci ?? "Öğrenci"}
                        {r.sinif ? (
                          <span className="ml-1 font-normal text-soluk">· {r.sinif}</span>
                        ) : null}
                      </div>
                      <div className="text-sm text-soluk">
                        {RANDEVU_TUR_ADI[r.tur]} · {r.baslangic}
                      </div>
                    </div>
                    <span className="rounded-chip border border-cizgi bg-zemin px-2 py-0.5 text-[11px] font-bold text-soluk">
                      {RANDEVU_DURUM_ADI[r.durum]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {sekme === "talepler" ? (
        <TalepKuyrugu
          okulSlug={okulSlug}
          talepler={etutTalepleri}
          bekliyor={bekliyor}
          calis={calis}
        />
      ) : null}

      {sekme === "denemeler" ? (
        <DenemeBolumu
          okulSlug={okulSlug}
          denemeler={denemeler}
          seciliDeneme={seciliDeneme}
          sonuclar={denemeSonuclari}
          ogrenciler={ogrenciler}
          dersler={dersler}
          bekliyor={bekliyor}
          calis={calis}
        />
      ) : null}

      {sekme === "vakalar" ? (
        <VakaListesi
          vakalar={vakaListesi}
          notlar={notlar}
          seciliVaka={seciliVaka}
          okulSlug={okulSlug}
          bekliyor={bekliyor}
          calis={calis}
        />
      ) : null}

      {sekme === "randevular" ? (
        <section>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
            Tüm randevular ({randevuListesi.length})
          </h2>
          {randevuListesi.length === 0 ? (
            <Bos>Kayıtlı randevu yok.</Bos>
          ) : (
            <ul className="space-y-2">
              {randevuListesi.map((r) => (
                <li key={r.id} className="rounded-kart border border-cizgi bg-white p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {r.ogrenci ?? "Öğrenci"}
                      {r.sinif ? (
                        <span className="ml-1 font-normal text-soluk">· {r.sinif}</span>
                      ) : null}
                    </span>
                    <span className="rounded-chip border border-cizgi bg-zemin px-2 py-0.5 text-[11px] font-bold text-soluk">
                      {RANDEVU_DURUM_ADI[r.durum]}
                    </span>
                  </div>
                  <div className="text-sm text-soluk">
                    {RANDEVU_TUR_ADI[r.tur]}
                    {r.tarih ? ` · ${r.tarih} ${r.baslangic ?? ""}` : " · zaman belirlenmedi"}
                  </div>
                  {r.talepNotu ? (
                    <p className="mt-1 text-sm">{r.talepNotu}</p>
                  ) : null}
                  {r.retNedeni ? (
                    <p className="mt-1 text-sm text-marka-koyu">Gerekçe: {r.retNedeni}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

type Calis = (islem: () => Promise<{ hata?: string; basari?: string }>) => void;

function RiskKuyrugu({
  risk,
  okulSlug,
  bekliyor,
  calis,
}: {
  risk: RiskKaydi[];
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [vakaAcilan, setVakaAcilan] = useState<RiskKaydi | null>(null);

  return (
    <section>
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-soluk">
        Erken uyarı kuyruğu ({risk.length})
      </h2>
      <p className="mb-2 text-xs text-soluk">
        Devamsızlık, katılım ve değerlendirme verisinden hesaplanır. Sıralama aracıdır,
        öğrenci hakkında bir değerlendirme değildir.
      </p>

      {vakaAcilan ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            calis(async () => {
              const r = await vakaAc(okulSlug, {
                ogrenciId: vakaAcilan.ogrenciId,
                baslik: String(f.get("baslik") ?? ""),
                oncelik: String(f.get("oncelik") ?? "normal"),
              });
              if (r.basari) setVakaAcilan(null);
              return r;
            });
          }}
          className="mb-3 space-y-3 rounded-kart border border-mavi/30 bg-mavi-acik p-4"
        >
          <h3 className="text-sm font-bold text-mavi-koyu">
            {vakaAcilan.adSoyad} için vaka aç
          </h3>
          <input
            name="baslik"
            required
            placeholder="Görüşme konusu (ör. sınav kaygısı)"
            className="block w-full rounded-lg border border-cizgi bg-white px-3 py-2 text-sm"
          />
          <select
            name="oncelik"
            defaultValue={vakaAcilan.skor >= 60 ? "yuksek" : "normal"}
            className="block rounded-lg border border-cizgi bg-white px-3 py-2 text-sm"
          >
            <option value="yuksek">Öncelikli</option>
            <option value="normal">Normal</option>
            <option value="dusuk">Düşük</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={bekliyor}
              className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              Vakayı Aç
            </button>
            <button
              type="button"
              onClick={() => setVakaAcilan(null)}
              className="rounded-lg border border-cizgi bg-white px-4 py-2 text-sm font-semibold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {risk.length === 0 ? (
        <Bos>Uyarı gerektiren öğrenci yok.</Bos>
      ) : (
        <ul className="space-y-2">
          {risk.map((r) => {
            const band = riskBandi(r.skor);
            return (
              <li key={r.ogrenciId} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {r.adSoyad}
                    {r.sinif ? (
                      <span className="ml-1 font-normal text-soluk">· {r.sinif}</span>
                    ) : null}
                  </span>
                  <span
                    className={`rounded-chip border px-2 py-0.5 text-[11px] font-bold ${band.sinif}`}
                  >
                    {band.etiket} · {r.skor}
                  </span>
                </div>
                <div className="text-sm text-soluk">
                  mentör: {r.mentor ?? "atanmadı"}
                </div>
                {r.gerekceler.length > 0 ? (
                  <p className="mt-1 text-sm text-soluk">{r.gerekceler.join(" · ")}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.acikVaka === 0 ? (
                    <button
                      type="button"
                      onClick={() => setVakaAcilan(r)}
                      className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                    >
                      Vaka aç
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-soluk">
                      Açık vakası var.
                    </span>
                  )}
                  {/* Sıradaki skor bir özet; gerekçenin arkasındaki kayıtlar
                      raporda. Görüşmeden önce bakılacak yer burası. */}
                  <Link
                    href={`/${okulSlug}/rapor/${r.ogrenciId}`}
                    className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                  >
                    Gelişim raporu
                  </Link>
                  <Link
                    href={`/${okulSlug}/plan/${r.ogrenciId}`}
                    className="rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
                  >
                    Haftalık plan
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RandevuTalepleri({
  talepler,
  bugun,
  okulSlug,
  bekliyor,
  calis,
}: {
  talepler: Randevu[];
  bugun: string;
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [redEdilen, setRedEdilen] = useState<string | null>(null);
  const [redNedeni, setRedNedeni] = useState("");

  return (
    <section>
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
        Randevu talepleri ({talepler.length})
      </h2>
      {talepler.length === 0 ? (
        <Bos>Bekleyen talep yok.</Bos>
      ) : (
        <ul className="space-y-2">
          {talepler.map((r) => (
            <li key={r.id} className="rounded-kart border border-uyari/30 bg-uyari-acik p-3">
              <div className="font-semibold">
                {r.ogrenci ?? "Öğrenci"}
                {r.sinif ? (
                  <span className="ml-1 font-normal text-soluk">· {r.sinif}</span>
                ) : null}
              </div>
              {r.talepNotu ? <p className="mt-1 text-sm">{r.talepNotu}</p> : null}

              {redEdilen === r.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    calis(async () => {
                      const s = await randevuReddet(okulSlug, r.id, redNedeni);
                      if (s.basari) {
                        setRedEdilen(null);
                        setRedNedeni("");
                      }
                      return s;
                    });
                  }}
                  className="mt-2 space-y-2"
                >
                  <input
                    value={redNedeni}
                    onChange={(e) => setRedNedeni(e.target.value)}
                    required
                    placeholder="Gerekçe — veliye iletilecek"
                    className="w-full rounded-lg border border-cizgi bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={bekliyor}
                      className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => setRedEdilen(null)}
                      className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold"
                    >
                      Vazgeç
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    calis(() =>
                      randevuPlanla(okulSlug, {
                        randevuId: r.id,
                        tarih: String(f.get("tarih") ?? ""),
                        baslangic: String(f.get("baslangic") ?? ""),
                        tur: String(f.get("tur") ?? "bireysel"),
                      }),
                    );
                  }}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <input
                    type="date"
                    name="tarih"
                    required
                    defaultValue={bugun}
                    className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm"
                  />
                  <input
                    type="time"
                    name="baslangic"
                    required
                    defaultValue="15:00"
                    className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm"
                  />
                  <select
                    name="tur"
                    defaultValue="veli"
                    className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm"
                  >
                    <option value="bireysel">Bireysel</option>
                    <option value="veli">Veli</option>
                    <option value="grup">Grup</option>
                  </select>
                  <button
                    type="submit"
                    disabled={bekliyor}
                    className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Randevu Oluştur
                  </button>
                  <button
                    type="button"
                    onClick={() => setRedEdilen(r.id)}
                    className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold"
                  >
                    Reddet
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VakaListesi({
  vakalar,
  notlar,
  seciliVaka,
  okulSlug,
  bekliyor,
  calis,
}: {
  vakalar: Vaka[];
  notlar: GorusmeNotu[];
  seciliVaka: string | null;
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  if (vakalar.length === 0) {
    return <Bos>Kayıtlı vaka yok. Uyarı kuyruğundan vaka açabilirsiniz.</Bos>;
  }

  return (
    <ul className="space-y-3">
      {vakalar.map((v) => (
        <li key={v.id} className="rounded-kart border border-cizgi bg-white p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">
              {v.ogrenci ?? "Öğrenci"}
              {v.sinif ? <span className="ml-1 font-normal text-soluk">· {v.sinif}</span> : null}
            </span>
            <div className="flex gap-2">
              <span
                className={`rounded-chip border px-2 py-0.5 text-[11px] font-bold ${ONCELIK_SINIFI[v.oncelik]}`}
              >
                {ONCELIK_ADI[v.oncelik]}
              </span>
              <span className="rounded-chip border border-cizgi bg-zemin px-2 py-0.5 text-[11px] font-bold text-soluk">
                {VAKA_DURUM_ADI[v.durum]}
              </span>
            </div>
          </div>
          <div className="text-sm">{v.baslik}</div>
          <div className="text-sm text-soluk">
            {v.notSayisi} not · açan: {v.acan ?? "—"}
          </div>

          <a
            href={`/${okulSlug}/rehberlik?vaka=${v.id}`}
            className="mt-2 inline-block rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
          >
            {seciliVaka === v.id ? "Notlar aşağıda" : "Notları aç"}
          </a>

          {seciliVaka === v.id ? (
            <VakaNotlari
              vakaId={v.id}
              notlar={notlar}
              durum={v.durum}
              okulSlug={okulSlug}
              bekliyor={bekliyor}
              calis={calis}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function VakaNotlari({
  vakaId,
  notlar,
  durum,
  okulSlug,
  bekliyor,
  calis,
}: {
  vakaId: string;
  notlar: GorusmeNotu[];
  durum: Vaka["durum"];
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [anahtar, setAnahtar] = useState(0);
  const [kapaniyor, setKapaniyor] = useState(false);

  return (
    <div className="mt-3 border-t border-cizgi pt-3">
      <form
        key={anahtar}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const paylas = f.getAll("paylas").map(String);
          calis(async () => {
            const r = await notEkle(okulSlug, {
              vakaId,
              metin: String(f.get("metin") ?? ""),
              paylas,
              yalnizcaYazan: f.get("yalnizcaYazan") === "on",
            });
            if (r.basari) setAnahtar((a) => a + 1);
            return r;
          });
        }}
        className="space-y-2"
      >
        <textarea
          name="metin"
          rows={3}
          required
          placeholder="Görüşme notu"
          className="w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-soluk">Paylaş:</span>
          {(
            [
              ["mentor", "mentör"],
              ["ogretmen", "öğretmenler"],
              ["veli", "veli"],
            ] as const
          ).map(([deger, etiket]) => (
            <label key={deger} className="flex items-center gap-1.5">
              <input type="checkbox" name="paylas" value={deger} className="size-4" />
              {etiket}
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="yalnizcaYazan" className="size-4" />
            yalnızca ben
          </label>
        </div>
        <p className="text-xs text-soluk">
          Hiçbiri seçilmezse not yalnızca rehberlik servisine görünür.
        </p>
        <button
          type="submit"
          disabled={bekliyor}
          className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
        >
          Notu Kaydet
        </button>
      </form>

      {notlar.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notlar.map((n) => (
            <li key={n.id} className="rounded-lg bg-zemin p-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold">{n.yazan ?? "Rehberlik"}</span>
                <span className="text-[11px] text-soluk">
                  {gorunurlukMetni(n.gorunurluk, n.yalnizcaYazan)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.metin}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-soluk">Bu vakada henüz not yok.</p>
      )}

      {durum !== "kapandi" ? (
        kapaniyor ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              calis(() =>
                vakaDurumu(okulSlug, vakaId, "kapandi", String(f.get("ozet") ?? "")),
              );
            }}
            className="mt-3 space-y-2 border-t border-cizgi pt-3"
          >
            <input
              name="ozet"
              required
              placeholder="Kapanış özeti"
              className="w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={bekliyor}
                className="rounded-lg bg-marka px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Vakayı Kapat
              </button>
              <button
                type="button"
                onClick={() => setKapaniyor(false)}
                className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold"
              >
                Vazgeç
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setKapaniyor(true)}
            className="mt-3 rounded-lg border border-cizgi px-3 py-1 text-xs font-semibold hover:bg-zemin"
          >
            Vakayı kapat
          </button>
        )
      ) : null}
    </div>
  );
}

function Kutu({ deger, etiket, renk }: { deger: number; etiket: string; renk?: string }) {
  return (
    <div className="rounded-kart border border-cizgi bg-white px-3 py-2">
      <div className={`text-2xl font-extrabold ${renk ?? ""}`}>{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}

function Bos({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-kart border border-dashed border-cizgi bg-white p-6 text-center text-sm text-soluk">
      {children}
    </div>
  );
}
