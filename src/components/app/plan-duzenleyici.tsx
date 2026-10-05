"use client";

/**
 * Haftalık çalışma planı formu.
 *
 * Hafta, ADRES SATIRINDA taşınıyor (`?hafta=`): rehber bir haftanın
 * bağlantısını paylaşabiliyor ve geri tuşu çalışıyor.
 *
 * Satırlar GÜNE GÖRE gruplanmış bir form değil, düz bir liste: yedi günün
 * altına yedi ayrı bölüm koymak, boş günler yüzünden formu üç ekran boyu
 * uzatıyordu. Her satır kendi gününü seçiyor.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { planKaydet, planSil, type PlanSonuc } from "@/lib/plan/actions";
import { gunAdi, ogeMetni, planOzeti } from "@/lib/plan/gorunum";
import type { Plan } from "@/lib/plan/gorunum";
import type { DizinDersi, DizinOgrencisi } from "@/lib/rehberlik/dizin";

interface Konu {
  id: string;
  ad: string;
  subject_id: string;
}

interface Satir {
  gun: string;
  subjectId: string;
  topicId: string;
  hedefSoru: string;
}

interface Props {
  okulSlug: string;
  ogrenci: DizinOgrencisi;
  haftaBasi: string;
  plan: Plan | null;
  dersler: DizinDersi[];
  konular: Konu[];
  rehberMi: boolean;
}

/** "YYYY-MM-DD" + n gün. Takvimdeki `gunEkle` ile aynı hesap. */
function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  const d = new Date(Date.UTC(y, a - 1, g));
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

export function PlanDuzenleyici({
  okulSlug,
  ogrenci,
  haftaBasi,
  plan,
  dersler,
  konular,
  rehberMi,
}: Props) {
  const gunler = useMemo(
    () => Array.from({ length: 7 }, (_, i) => gunEkle(haftaBasi, i)),
    [haftaBasi],
  );

  const [satirlar, setSatirlar] = useState<Satir[]>(() =>
    plan && plan.ogeler.length
      ? plan.ogeler.map((o) => ({
          gun: o.tarih,
          subjectId: o.subjectId ?? "",
          topicId: "",
          hedefSoru: o.hedefSoru ? String(o.hedefSoru) : "",
        }))
      : [{ gun: haftaBasi, subjectId: "", topicId: "", hedefSoru: "" }],
  );
  const [not, setNot] = useState(plan?.notMetni ?? "");
  const [sonuc, setSonuc] = useState<PlanSonuc>({});
  const [bekliyor, basla] = useTransition();

  const ozet = plan ? planOzeti(plan.ogeler) : null;
  const isaretliVar = ozet !== null && ozet.yapildi + ozet.yapilmadi > 0;

  const guncelle = (i: number, alan: keyof Satir, deger: string) =>
    setSatirlar((s) =>
      s.map((x, j) =>
        j === i
          ? {
              ...x,
              [alan]: deger,
              // Ders değişince konu geçersizleşir; eski konu başka derse ait
              // kalırsa kaydetmede sessizce yanlış veri oluşurdu.
              ...(alan === "subjectId" ? { topicId: "" } : {}),
            }
          : x,
      ),
    );

  const calis = (islem: () => Promise<PlanSonuc>) =>
    basla(async () => setSonuc(await islem()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={rehberMi ? `/${okulSlug}/rehberlik` : `/${okulSlug}/ogretmen/calisma`}
          className="rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          ← Geri
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">
            {ogrenci.adSoyad}
            <span className="ml-2 text-sm font-normal text-soluk">
              No {ogrenci.okulNo}
              {ogrenci.sinif ? ` · ${ogrenci.sinif}` : ""}
            </span>
          </h1>
          <p className="text-sm text-soluk">Haftalık çalışma planı</p>
        </div>
        <Link
          href={`/${okulSlug}/rapor/${ogrenci.id}`}
          className="rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Gelişim raporu
        </Link>
      </div>

      {/* Hafta gezinmesi */}
      <div className="flex flex-wrap items-center gap-2 rounded-kart border border-cizgi bg-white p-3">
        <Link
          href={`/${okulSlug}/plan/${ogrenci.id}?hafta=${gunEkle(haftaBasi, -7)}`}
          className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
        >
          ‹ Önceki
        </Link>
        <span className="text-sm font-bold">
          {haftaBasi} – {gunEkle(haftaBasi, 6)}
        </span>
        <Link
          href={`/${okulSlug}/plan/${ogrenci.id}?hafta=${gunEkle(haftaBasi, 7)}`}
          className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
        >
          Sonraki ›
        </Link>
        {ozet ? (
          <span className="ml-auto text-sm text-soluk">
            {ozet.toplam} satır · {ozet.yapildi} yapıldı · {ozet.yapilmadi} yapılmadı
          </span>
        ) : (
          <span className="ml-auto text-sm text-soluk">Bu hafta plan yok</span>
        )}
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

      {isaretliVar ? (
        <div className="rounded-kart border border-uyari/30 bg-uyari-acik p-3 text-sm">
          Öğrenci bu planın {ozet!.yapildi + ozet!.yapilmadi} satırını işaretlemiş.
          Planı kaydederseniz satırlar yeniden yazılır ve <b>işaretler silinir</b>.
        </div>
      ) : null}

      {/* Satırlar */}
      <div className="space-y-2">
        {satirlar.map((s, i) => {
          const dersKonulari = konular.filter((k) => k.subject_id === s.subjectId);
          return (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-kart border border-cizgi bg-white p-3"
            >
              <label className="text-xs font-semibold text-soluk">
                Gün
                <select
                  value={s.gun}
                  onChange={(e) => guncelle(i, "gun", e.target.value)}
                  className="mt-0.5 block w-36 rounded-lg border border-cizgi bg-white px-2 py-1.5 text-sm text-ink"
                >
                  {gunler.map((g) => (
                    <option key={g} value={g}>
                      {gunAdi(g)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-soluk">
                Ders
                <select
                  value={s.subjectId}
                  onChange={(e) => guncelle(i, "subjectId", e.target.value)}
                  className="mt-0.5 block w-40 rounded-lg border border-cizgi bg-white px-2 py-1.5 text-sm text-ink"
                >
                  <option value="">Serbest</option>
                  {dersler.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ad}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-soluk">
                Konu
                <select
                  value={s.topicId}
                  onChange={(e) => guncelle(i, "topicId", e.target.value)}
                  disabled={!s.subjectId}
                  className="mt-0.5 block w-44 rounded-lg border border-cizgi bg-white px-2 py-1.5 text-sm text-ink disabled:opacity-50"
                >
                  <option value="">—</option>
                  {dersKonulari.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.ad}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-soluk">
                Soru
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={s.hedefSoru}
                  onChange={(e) => guncelle(i, "hedefSoru", e.target.value)}
                  className="mt-0.5 block w-24 rounded-lg border border-cizgi px-2 py-1.5 text-sm text-ink"
                />
              </label>

              {satirlar.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSatirlar((x) => x.filter((_, j) => j !== i))}
                  className="rounded-lg border border-cizgi px-2.5 py-1.5 text-xs font-semibold hover:bg-zemin"
                >
                  Çıkar
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setSatirlar((s) => [
              ...s,
              // Yeni satır son satırın gününden başlar: plan genelde gün gün
              // ilerliyor, her seferinde pazartesiye dönmek fazladan tıklama.
              { gun: s.at(-1)?.gun ?? haftaBasi, subjectId: "", topicId: "", hedefSoru: "" },
            ])
          }
          className="rounded-lg border border-cizgi bg-white px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
        >
          + Satır ekle
        </button>
      </div>

      <label className="block text-sm font-semibold">
        Plan notu (isteğe bağlı)
        <textarea
          value={not}
          onChange={(e) => setNot(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Bu hafta özellikle deneme analizine ağırlık ver."
          className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={bekliyor}
          onClick={() =>
            calis(() =>
              planKaydet(okulSlug, {
                ogrenciId: ogrenci.id,
                haftaBasi,
                notMetni: not,
                ogeler: satirlar.map((s) => ({
                  gun: s.gun,
                  subjectId: s.subjectId,
                  topicId: s.topicId,
                  hedefSoru: s.hedefSoru ? Number(s.hedefSoru) : null,
                })),
              }),
            )
          }
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-50"
        >
          {plan ? "Planı güncelle" : "Planı kaydet"}
        </button>
        {plan ? (
          <button
            type="button"
            disabled={bekliyor}
            onClick={() => calis(() => planSil(okulSlug, plan.id))}
            className="rounded-lg border border-cizgi px-3 py-2 text-sm font-semibold hover:bg-zemin disabled:opacity-50"
          >
            Planı sil
          </button>
        ) : null}
      </div>

      {/* Mevcut planın öğrenci gözüyle hâli */}
      {plan && plan.ogeler.length ? (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
            Kayıtlı plan
          </h2>
          <ul className="divide-y divide-cizgi overflow-hidden rounded-kart border border-cizgi bg-white text-sm">
            {plan.ogeler.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="w-24 shrink-0 font-semibold">{gunAdi(o.tarih)}</span>
                <span className="min-w-0 flex-1">{ogeMetni(o)}</span>
                <span className="text-xs text-soluk">
                  {o.durum === "yapildi"
                    ? "Yapıldı"
                    : o.durum === "yapilmadi"
                      ? "Yapılmadı"
                      : "Bekliyor"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
