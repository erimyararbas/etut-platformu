"use client";

/**
 * Öğrencinin haftalık planı: satırları görür ve yaptı/yapmadı işaretler.
 *
 * İŞARET GERİ ALINABİLİR. Yanlışlıkla "yapıldı" diyen öğrenci düzeltebilmeli;
 * tek yönlü bir işaret, öğrenciyi yanlış bir kayıtla baş başa bırakırdı.
 * Aynı düğmeye tekrar basmak işareti kaldırıyor.
 */

import { useState, useTransition } from "react";
import { ogeIsaretle } from "@/lib/plan/actions";
import { DURUM_SINIFI, gunAdi, ogeMetni, planOzeti } from "@/lib/plan/gorunum";
import type { Plan, PlanOgesiDurumu } from "@/lib/plan/gorunum";

interface Props {
  okulSlug: string;
  plan: Plan | null;
  /** Bugünün tarihi — geçmiş günleri soluklaştırmak için. */
  bugun: string;
}

export function PlanPaneli({ okulSlug, plan, bugun }: Props) {
  const [bekliyor, basla] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  if (!plan || plan.ogeler.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
          Bu haftaki planım
        </h2>
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-6 text-center text-sm text-soluk">
          Bu hafta için plan yazılmamış.
        </div>
      </section>
    );
  }

  const ozet = planOzeti(plan.ogeler);

  const isaretle = (ogeId: string, mevcut: PlanOgesiDurumu, hedef: PlanOgesiDurumu) =>
    basla(async () => {
      setHata(null);
      // Aynı düğmeye tekrar basmak işareti kaldırır.
      const s = await ogeIsaretle(okulSlug, ogeId, mevcut === hedef ? "bekliyor" : hedef);
      if (s.hata) setHata(s.hata);
    });

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-soluk">
          Bu haftaki planım
        </h2>
        <span className="text-xs text-soluk">
          {plan.olusturan ? `${plan.olusturan} yazdı · ` : ""}
          {ozet.yapildi}/{ozet.toplam} yapıldı
        </span>
      </div>

      {hata ? (
        <div className="mb-2 rounded-kart border border-marka/30 bg-marka-acik p-3 text-sm font-semibold text-marka-koyu">
          {hata}
        </div>
      ) : null}

      {plan.notMetni ? (
        <p className="mb-2 rounded-kart border border-mavi/30 bg-mavi-acik p-3 text-sm text-mavi-koyu">
          {plan.notMetni}
        </p>
      ) : null}

      <ul className="divide-y divide-cizgi overflow-hidden rounded-kart border border-cizgi bg-white">
        {plan.ogeler.map((o) => (
          <li
            key={o.id}
            className={`flex flex-wrap items-center gap-2 p-3 ${
              o.tarih < bugun && o.durum === "bekliyor" ? "bg-zemin/60" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {gunAdi(o.tarih)}
                {o.tarih === bugun ? (
                  <span className="ml-2 rounded-chip bg-mavi-acik px-2 py-0.5 text-[11px] font-bold text-mavi">
                    Bugün
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-soluk">{ogeMetni(o)}</div>
            </div>

            <span
              className={`rounded-chip px-2 py-0.5 text-[11px] font-bold ${DURUM_SINIFI[o.durum]}`}
            >
              {o.durum === "yapildi"
                ? "Yapıldı"
                : o.durum === "yapilmadi"
                  ? "Yapılmadı"
                  : "Bekliyor"}
            </span>

            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={bekliyor}
                aria-pressed={o.durum === "yapildi"}
                onClick={() => isaretle(o.id, o.durum, "yapildi")}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                  o.durum === "yapildi"
                    ? "border-basarili bg-basarili text-white"
                    : "border-cizgi hover:bg-zemin"
                }`}
              >
                Yaptım
              </button>
              <button
                type="button"
                disabled={bekliyor}
                aria-pressed={o.durum === "yapilmadi"}
                onClick={() => isaretle(o.id, o.durum, "yapilmadi")}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                  o.durum === "yapilmadi"
                    ? "border-marka bg-marka text-white"
                    : "border-cizgi hover:bg-zemin"
                }`}
              >
                Yapmadım
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-soluk">
        İşaretini değiştirmek için aynı düğmeye tekrar basabilirsin.
      </p>
    </section>
  );
}
