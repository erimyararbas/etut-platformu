"use client";

/**
 * Öğrencinin etüt takvimi — aylık ve haftalık görünüm.
 *
 * Veri, etüt listesiyle AYNI kaynaktan gelir (`ogrenci_etut_listesi`); takvim
 * ayrı bir sorgu çalıştırmaz. Böylece iki ekranın "kayıtlı mıyım" konusunda
 * ayrışması mümkün değil.
 *
 * İki görünüm farklı sorulara cevap veriyor: aylık "bu ay hangi günler dolu?",
 * haftalık "önümüzdeki günlerde tam olarak neye gideceğim?". İkincisi telefonda
 * daha çok kullanılacağı için gün gün açık liste hâlinde; saat ızgarası
 * (08:00–18:00 sütunları) 375 piksele sığmıyor ve okulda etütler zaten günde
 * birkaç tane.
 */

import { useMemo, useState } from "react";
import type { OgrenciEtut } from "@/lib/etut/ogrenci-gorunum";
import type { PlanOgesi } from "@/lib/plan/gorunum";
import { ogeMetni } from "@/lib/plan/gorunum";
import {
  GUN_BASLIKLARI,
  ayIzgarasi,
  ayiCoz,
  baslikMetni,
  gunEkle,
  gunlereGore,
  haftaBasligi,
  haftaGunleri,
  oncekiAy,
  sonrakiAy,
} from "@/lib/etut/takvim";

interface Props {
  etutler: OgrenciEtut[];
  /**
   * Haftalık çalışma planının satırları (0028). Etütlerden AYRI bir katman:
   * etüt okulun açtığı bir randevu, plan satırı ise öğrencinin kendi başına
   * yapacağı çalışma. Aynı listede karıştırmak, öğrencinin "nereye gideceğim"
   * ile "ne çalışacağım" sorularını birbirine katardı.
   */
  planOgeleri: PlanOgesi[];
  /** Okulun saat dilimindeki bugün ("YYYY-MM-DD"), sunucudan gelir. */
  bugun: string;
}

type Gorunum = "ay" | "hafta";

export function EtutTakvimi({ etutler, planOgeleri, bugun }: Props) {
  const baslangic = ayiCoz(bugun);
  const [gorunum, setGorunum] = useState<Gorunum>("ay");
  const [yil, setYil] = useState(baslangic.yil);
  const [ay, setAy] = useState(baslangic.ay);
  const [secili, setSecili] = useState<string>(bugun);
  /** Haftalık görünümde gezinilen haftanın herhangi bir günü. */
  const [haftaIcinde, setHaftaIcinde] = useState<string>(bugun);

  const gunler = useMemo(() => gunlereGore(etutler), [etutler]);
  // Plan öğelerinin görünüm tipinde alan adı `tarih`; bu yüzden aynı
  // yardımcıdan geçiyorlar ve ikinci bir gruplama kodu yok (bkz. plan/gorunum).
  const planGunleri = useMemo(() => gunlereGore(planOgeleri), [planOgeleri]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["ay", "hafta"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGorunum(g)}
            className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
              gorunum === g
                ? "border-lacivert bg-lacivert text-white"
                : "border-cizgi bg-white text-ink-2 hover:bg-zemin"
            }`}
          >
            {g === "ay" ? "Aylık" : "Haftalık"}
          </button>
        ))}
      </div>

      {gorunum === "ay" ? (
        <AyGorunumu
          yil={yil}
          ay={ay}
          bugun={bugun}
          secili={secili}
          gunler={gunler}
          planGunleri={planGunleri}
          setSecili={setSecili}
          git={(h) => {
            setYil(h.yil);
            setAy(h.ay);
          }}
        />
      ) : (
        <HaftaGorunumu
          haftaIcinde={haftaIcinde}
          bugun={bugun}
          gunler={gunler}
          planGunleri={planGunleri}
          git={setHaftaIcinde}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aylık
// ---------------------------------------------------------------------------

function AyGorunumu({
  yil,
  ay,
  bugun,
  secili,
  gunler,
  planGunleri,
  setSecili,
  git,
}: {
  yil: number;
  ay: number;
  bugun: string;
  secili: string;
  gunler: Map<string, OgrenciEtut[]>;
  planGunleri: Map<string, PlanOgesi[]>;
  setSecili: (t: string) => void;
  git: (hedef: { yil: number; ay: number }) => void;
}) {
  const izgara = useMemo(() => ayIzgarasi(yil, ay), [yil, ay]);
  const seciliEtutler = gunler.get(secili) ?? [];
  const seciliPlan = planGunleri.get(secili) ?? [];

  return (
    <>
      <div className="rounded-kart border border-cizgi bg-white p-3">
        <Gezinme
          baslik={baslikMetni(yil, ay)}
          geri={() => git(oncekiAy(yil, ay))}
          ileri={() => git(sonrakiAy(yil, ay))}
          geriEtiket="Önceki ay"
          ileriEtiket="Sonraki ay"
        />

        <div className="grid grid-cols-7 gap-1 text-center">
          {GUN_BASLIKLARI.map((g) => (
            <div key={g} className="py-1 text-[11px] font-bold uppercase text-soluk">
              {g}
            </div>
          ))}

          {izgara.map((g) => {
            const gunEtutleri = gunler.get(g.tarih) ?? [];
            const gunPlani = planGunleri.get(g.tarih) ?? [];
            const kayitli = gunEtutleri.some(
              (e) => e.benimDurumum === "rezerve" || e.benimDurumum === "atandi",
            );
            const seciliMi = g.tarih === secili;

            return (
              <button
                key={g.tarih}
                type="button"
                onClick={() => setSecili(g.tarih)}
                aria-current={g.tarih === bugun ? "date" : undefined}
                className={[
                  "relative aspect-square rounded-lg text-sm font-semibold transition-colors",
                  g.ayDisi ? "text-soluk/40" : "text-ink",
                  seciliMi
                    ? "bg-lacivert text-white"
                    : g.tarih === bugun
                      ? "bg-lacivert-acik"
                      : "hover:bg-zemin",
                ].join(" ")}
              >
                {g.gun}
                {gunEtutleri.length > 0 || gunPlani.length > 0 ? (
                  <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                    {gunEtutleri.length > 0 ? (
                      <span
                        className={[
                          "block size-1.5 rounded-full",
                          kayitli ? "bg-basarili" : seciliMi ? "bg-white/70" : "bg-mavi",
                        ].join(" ")}
                      />
                    ) : null}
                    {gunPlani.length > 0 ? (
                      <span
                        className={[
                          "block size-1.5 rounded-full",
                          seciliMi ? "bg-white/70" : "bg-uyari",
                        ].join(" ")}
                      />
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <Aciklama />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-extrabold">
          {secili.slice(8, 10)}{" "}
          {baslikMetni(Number(secili.slice(0, 4)), Number(secili.slice(5, 7)))}
        </h2>
        {seciliEtutler.length === 0 && seciliPlan.length === 0 ? (
          <BosGun />
        ) : (
          <div className="space-y-2">
            {seciliEtutler.length > 0 ? (
              <ul className="space-y-2">
                {seciliEtutler.map((e) => (
                  <EtutSatiri key={e.id} etut={e} />
                ))}
              </ul>
            ) : null}
            {seciliPlan.length > 0 ? <PlanListesi ogeler={seciliPlan} /> : null}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Haftalık
// ---------------------------------------------------------------------------

function HaftaGorunumu({
  haftaIcinde,
  bugun,
  gunler,
  planGunleri,
  git,
}: {
  haftaIcinde: string;
  bugun: string;
  gunler: Map<string, OgrenciEtut[]>;
  planGunleri: Map<string, PlanOgesi[]>;
  git: (t: string) => void;
}) {
  const hafta = useMemo(() => haftaGunleri(haftaIcinde), [haftaIcinde]);
  const toplam = hafta.reduce((n, t) => n + (gunler.get(t)?.length ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="rounded-kart border border-cizgi bg-white px-3 py-2">
        <Gezinme
          baslik={haftaBasligi(hafta)}
          geri={() => git(gunEkle(haftaIcinde, -7))}
          ileri={() => git(gunEkle(haftaIcinde, 7))}
          geriEtiket="Önceki hafta"
          ileriEtiket="Sonraki hafta"
        />
        <p className="pb-1 text-center text-xs text-soluk">
          {toplam === 0 ? "Bu hafta sana açık etüt yok" : `Bu hafta ${toplam} etüt`}
        </p>
      </div>

      <ul className="space-y-2">
        {hafta.map((tarih, i) => {
          const gunEtutleri = gunler.get(tarih) ?? [];
          const gunPlani = planGunleri.get(tarih) ?? [];
          const bugunMu = tarih === bugun;

          return (
            <li
              key={tarih}
              className={`rounded-kart border p-3 ${
                bugunMu ? "border-lacivert/40 bg-lacivert-acik" : "border-cizgi bg-white"
              }`}
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-extrabold">{GUN_BASLIKLARI[i]}</span>
                <span className="text-sm text-soluk">
                  {Number(tarih.slice(8, 10))}{" "}
                  {baslikMetni(Number(tarih.slice(0, 4)), Number(tarih.slice(5, 7))).split(" ")[0]}
                </span>
                {bugunMu ? (
                  <span className="rounded-chip bg-lacivert px-2 py-0.5 text-[10px] font-bold text-white">
                    Bugün
                  </span>
                ) : null}
              </div>

              {gunEtutleri.length === 0 && gunPlani.length === 0 ? (
                <p className="text-sm text-soluk">—</p>
              ) : (
                <div className="space-y-2">
                  {gunEtutleri.length > 0 ? (
                    <ul className="space-y-2">
                      {gunEtutleri.map((e) => (
                        <EtutSatiri key={e.id} etut={e} sade />
                      ))}
                    </ul>
                  ) : null}
                  {gunPlani.length > 0 ? <PlanListesi ogeler={gunPlani} sade /> : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------

function Gezinme({
  baslik,
  geri,
  ileri,
  geriEtiket,
  ileriEtiket,
}: {
  baslik: string;
  geri: () => void;
  ileri: () => void;
  geriEtiket: string;
  ileriEtiket: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label={geriEtiket}
        onClick={geri}
        className="rounded-lg border border-cizgi bg-white px-3 py-1 text-sm font-bold hover:bg-zemin"
      >
        ‹
      </button>
      <div className="text-sm font-extrabold">{baslik}</div>
      <button
        type="button"
        aria-label={ileriEtiket}
        onClick={ileri}
        className="rounded-lg border border-cizgi bg-white px-3 py-1 text-sm font-bold hover:bg-zemin"
      >
        ›
      </button>
    </div>
  );
}

/**
 * Takvimdeki plan satırları — SALT OKUNUR.
 *
 * İşaretleme burada değil, "Çalışmalarım" ekranında. Takvim "ne var" sorusunu
 * cevaplıyor; aynı işi iki ekranda yapılabilir kılmak, ikisinin farklı
 * davranması riskini boşuna açardı.
 */
function PlanListesi({ ogeler, sade }: { ogeler: PlanOgesi[]; sade?: boolean }) {
  return (
    <div
      className={
        sade
          ? "rounded-lg border border-uyari/30 bg-uyari-acik p-2"
          : "rounded-kart border border-uyari/30 bg-uyari-acik p-3"
      }
    >
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-uyari">
        Çalışma planı
      </div>
      <ul className="space-y-1">
        {ogeler.map((o) => (
          <li key={o.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">{ogeMetni(o)}</span>
            {o.durum !== "bekliyor" ? (
              <span
                className={`shrink-0 text-xs font-bold ${
                  o.durum === "yapildi" ? "text-basarili" : "text-marka"
                }`}
              >
                {o.durum === "yapildi" ? "Yapıldı" : "Yapılmadı"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Aciklama() {
  return (
    <div className="mt-3 flex flex-wrap gap-4 border-t border-cizgi pt-2 text-xs text-soluk">
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-basarili" /> Kayıtlı olduğun etüt
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-mavi" /> Açık etüt
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-uyari" /> Çalışma planı
      </span>
    </div>
  );
}

function BosGun() {
  return (
    <div className="rounded-kart border border-cizgi bg-white p-6 text-center text-sm text-soluk">
      Bu günde etüt veya plan yok.
    </div>
  );
}

/** `sade` haftalık görünüm için: kart içinde kart olmasın diye çerçevesiz. */
function EtutSatiri({ etut: e, sade }: { etut: OgrenciEtut; sade?: boolean }) {
  return (
    <li className={sade ? "" : "rounded-kart border border-cizgi bg-white p-3"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">{e.ders}</span>
        <span className="text-sm text-soluk">
          {e.baslangic}–{e.bitis}
        </span>
      </div>
      <div className="text-sm text-soluk">
        {e.ogretmen}
        {e.derslik ? ` · ${e.derslik}` : ""}
        {e.konu ? ` · ${e.konu}` : ""}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded-chip border border-cizgi bg-zemin px-2 py-0.5 text-[11px] font-bold text-soluk">
          {e.tur}
        </span>
        {e.benimDurumum === "rezerve" || e.benimDurumum === "atandi" ? (
          <span className="rounded-chip border border-basarili/30 bg-basarili-acik px-2 py-0.5 text-[11px] font-bold text-basarili">
            Kayıtlısın
          </span>
        ) : e.benimDurumum === "beklemede" ? (
          <span className="rounded-chip border border-uyari/30 bg-uyari-acik px-2 py-0.5 text-[11px] font-bold text-uyari">
            Sırada {e.benimSiram}.
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-soluk">
            {e.dolu}/{e.kontenjan} dolu
          </span>
        )}
      </div>
    </li>
  );
}
