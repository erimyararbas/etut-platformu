"use client";

/**
 * Bildirim listesi.
 *
 * Okundu işaretleme iyimser yapılır: sunucu yanıtı beklenirken satır zaten
 * sönükleşir. Bildirim okumak geri alınabilir bir işlem değil ve yanlış
 * giderse tek kaybedilen bir vurgudur — bekleme ekranı göstermeye değmez.
 */

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import {
  type Bildirim,
  TON_SINIFI,
  gecenSure,
  hedefYol,
  ton,
} from "@/lib/bildirim/gorunum";
import { okunduIsaretle, tumunuOkunduIsaretle } from "@/app/[okul]/bildirimler/actions";

interface Props {
  okulSlug: string;
  rol: string;
  bildirimler: Bildirim[];
}

export function BildirimListesi({ okulSlug, rol, bildirimler }: Props) {
  const [bekliyor, basla] = useTransition();
  const [liste, okunduVarsay] = useOptimistic(bildirimler, (mevcut, id: string | "hepsi") =>
    mevcut.map((b) => (id === "hepsi" || b.id === id ? { ...b, okunduMu: true } : b)),
  );

  const okunmamis = liste.filter((b) => !b.okunduMu).length;

  if (liste.length === 0) {
    return (
      <div className="rounded-kart border border-cizgi bg-white p-8 text-center">
        <div className="text-sm font-semibold">Henüz bildirimin yok</div>
        <p className="mt-1 text-sm text-soluk">
          Etüt kaydın, yoklaman ve öğretmen değerlendirmelerin burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-soluk">
          {okunmamis > 0 ? `${okunmamis} okunmamış bildirim` : "Tümü okundu"}
        </p>
        {okunmamis > 0 ? (
          <button
            type="button"
            disabled={bekliyor}
            onClick={() =>
              basla(async () => {
                okunduVarsay("hepsi");
                await tumunuOkunduIsaretle(okulSlug);
              })
            }
            className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold hover:bg-zemin disabled:opacity-50"
          >
            Tümünü okundu say
          </button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {liste.map((b) => {
          const yol = hedefYol(okulSlug, rol, b);
          const govde = (
            <div className="flex gap-3">
              <span
                className={`mt-0.5 h-fit shrink-0 rounded-chip border px-2 py-0.5 text-[11px] font-bold ${TON_SINIFI[ton(b.tip)]}`}
              >
                {b.okunduMu ? "" : "• "}
                {gecenSure(b.createdAt)}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm leading-snug ${b.okunduMu ? "font-semibold text-soluk" : "font-bold text-ink"}`}
                >
                  {b.baslik}
                </div>
                <p className="mt-0.5 text-sm leading-snug text-soluk">{b.govde}</p>
              </div>
            </div>
          );

          return (
            <li
              key={b.id}
              className={`rounded-kart border p-3 transition-colors ${
                b.okunduMu ? "border-cizgi bg-white/60" : "border-mavi/25 bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {yol ? (
                    <Link
                      href={yol}
                      onClick={() =>
                        basla(async () => {
                          if (b.okunduMu) return;
                          okunduVarsay(b.id);
                          await okunduIsaretle(okulSlug, b.id);
                        })
                      }
                    >
                      {govde}
                    </Link>
                  ) : (
                    govde
                  )}
                </div>
                {!b.okunduMu ? (
                  <button
                    type="button"
                    aria-label="Okundu işaretle"
                    title="Okundu işaretle"
                    disabled={bekliyor}
                    onClick={() =>
                      basla(async () => {
                        okunduVarsay(b.id);
                        await okunduIsaretle(okulSlug, b.id);
                      })
                    }
                    className="shrink-0 rounded-lg border border-cizgi px-2 py-1 text-xs font-semibold text-soluk hover:bg-zemin disabled:opacity-50"
                  >
                    Okundu
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
