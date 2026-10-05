"use client";

/**
 * Öğrencinin "Çalışmalarım" ekranı: seri, haftalık özet, soru sayacı ve hedefler.
 *
 * Sayaç sayıları iyimser güncelleniyor: her +/- dokunuşunda sunucu yanıtı
 * beklenmiyor. Öğrenci soru çözerken arka arkaya basıyor; her basışta bekleme
 * göstergesi çıksaydı sayaç kullanılamaz olurdu. Kayıt arka planda gidiyor,
 * bitirirken son değer kesinleşiyor.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  gunlukSeri,
  hedefYuzdesi,
  kalanSoruMetni,
  net,
  sureMetni,
  type CalismaOturumu,
  type CalismaOzeti,
  type Hedef,
} from "@/lib/calisma/gorunum";
import { GunlukCalismaGrafigi } from "./gunluk-calisma-grafigi";
import {
  hedefDurumu,
  hedefEkle,
  sayacBaslat,
  sayacBitir,
  sayaciIptalEt,
  sayimKaydet,
} from "@/app/[okul]/ogrenci/calisma/actions";

interface Props {
  okulSlug: string;
  ozet: CalismaOzeti;
}

export function CalismaPaneli({ okulSlug, ozet }: Props) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ hata?: string; basari?: string }>({});

  const acik = ozet.acikOturum;

  const aktifHedefler = ozet.hedefler.filter((h) => h.durum === "aktif");
  const atananlar = aktifHedefler.filter((h) => h.atayan !== null);
  const kendiHedefleri = aktifHedefler.filter((h) => h.atayan === null);

  const calis = (islem: () => Promise<{ hata?: string; basari?: string }>) =>
    basla(async () => setSonuc(await islem()));

  return (
    <div className="space-y-4">
      {/* Seri */}
      <div className="rounded-kart border border-cizgi bg-lacivert px-4 py-3 text-white">
        <div className="text-lg font-extrabold">
          {ozet.seri > 0 ? `${ozet.seri} günlük seri` : "Seriye başla"}
        </div>
        <p className="text-sm opacity-80">
          {ozet.seri > 0
            ? "Her gün çalışmaya devam et!"
            : "Bugün bir çalışma kaydı gir, seri başlasın."}
        </p>
      </div>

      {/* Haftalık özet */}
      <div className="grid grid-cols-3 gap-3">
        <Kutu deger={String(ozet.hafta.soru)} etiket="bu hafta soru" />
        <Kutu deger={String(ozet.hafta.net)} etiket="net" />
        <Kutu deger={sureMetni(ozet.hafta.sureSaniye)} etiket="çalışma" />
      </div>

      <GunlukCalismaGrafigi
        seri={gunlukSeri(ozet.oturumlar, ozet.bugun)}
        bugun={ozet.bugun}
      />

      {sonuc.hata ? <Uyari ton="olumsuz">{sonuc.hata}</Uyari> : null}
      {sonuc.basari ? <Uyari ton="olumlu">{sonuc.basari}</Uyari> : null}

      {/* Sayaç */}
      <section className="rounded-kart border border-cizgi bg-white p-4">
        <h2 className="text-sm font-bold">Çalışma Sayacı</h2>

        {acik ? (
          /* key: yeni bir oturum açıldığında sayaçlar sıfırdan kurulur.
             Durumu efektle eşitlemek basamaklı render üretiyordu. */
          <AcikSayac
            key={acik.id}
            oturum={acik}
            hedefBaslik={ozet.hedefler.find((h) => h.id === acik.goalId)?.baslik ?? null}
            okulSlug={okulSlug}
            bekliyor={bekliyor}
            calis={calis}
          />
        ) : (
          <>
            <p className="mt-0.5 text-sm text-soluk">
              Bir hedef seçip başlat, ya da hedefsiz serbest çalışma kaydı tut.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bekliyor}
                onClick={() => calis(() => sayacBaslat(okulSlug, null))}
                className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-60"
              >
                Serbest çalışma başlat
              </button>
              {aktifHedefler.slice(0, 3).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={bekliyor}
                  onClick={() => calis(() => sayacBaslat(okulSlug, h.id))}
                  className="rounded-lg border border-cizgi px-3 py-2 text-sm font-semibold hover:bg-zemin disabled:opacity-60"
                >
                  {h.baslik}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <HedefBolumu
        baslik="Bana Atananlar"
        bosMetin="Öğretmenlerin henüz hedef vermemiş."
        hedefler={atananlar}
        okulSlug={okulSlug}
        bekliyor={bekliyor}
        calis={calis}
      />

      <HedefBolumu
        baslik="Kendi Hedeflerim"
        bosMetin="Kendine bir hedef koyabilirsin."
        hedefler={kendiHedefleri}
        okulSlug={okulSlug}
        bekliyor={bekliyor}
        calis={calis}
        kapatilabilir
      />

      <HedefFormu okulSlug={okulSlug} bekliyor={bekliyor} calis={calis} />
    </div>
  );
}

type Calis = (islem: () => Promise<{ hata?: string; basari?: string }>) => void;

/**
 * Açık sayaç. Kendi durumunu tutar; dışarıdan gelen oturum değişince `key`
 * sayesinde yeniden kurulur, prop'tan state'e kopyalayan efekte gerek kalmaz.
 */
function AcikSayac({
  oturum,
  hedefBaslik,
  okulSlug,
  bekliyor,
  calis,
}: {
  oturum: CalismaOturumu;
  /** Oturum bir hedefe bağlıysa o hedefin adı. */
  hedefBaslik: string | null;
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [dogru, setDogru] = useState(oturum.dogru);
  const [yanlis, setYanlis] = useState(oturum.yanlis);
  const [bos, setBos] = useState(oturum.bos);
  const [notMetni, setNotMetni] = useState("");

  // Sayılar arka planda kaydediliyor: her dokunuşta değil, el durunca. Öğrenci
  // soru çözerken arka arkaya basıyor; her basışı sunucuya götürmek hem
  // gereksiz hem de sayacı yavaşlatırdı.
  const kaydetZamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (kaydetZamanlayici.current) clearTimeout(kaydetZamanlayici.current);
    kaydetZamanlayici.current = setTimeout(() => {
      void sayimKaydet(okulSlug, oturum.id, { dogru, yanlis, bos });
    }, 1200);
    return () => {
      if (kaydetZamanlayici.current) clearTimeout(kaydetZamanlayici.current);
    };
  }, [dogru, yanlis, bos, oturum.id, okulSlug]);

  return (
    <>
      {/* Hedefin dersi girilmemiş olabilir; o zaman hedefin adı tek bilgidir.
          "Serbest çalışma" yalnızca gerçekten hedefsiz oturumlar için. */}
      <p className="mt-0.5 text-sm text-soluk">
        {[hedefBaslik, oturum.ders, oturum.konu].filter(Boolean).join(" · ") ||
          "Serbest çalışma"}
      </p>

      <div className="my-3 flex items-baseline gap-4">
        <div>
          <div className="text-3xl font-extrabold tabular-nums">{net(dogru, yanlis)}</div>
          <div className="text-xs text-soluk">net</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums">{dogru + yanlis + bos}</div>
          <div className="text-xs text-soluk">çözülen soru</div>
        </div>
        <div className="ml-auto text-xs text-soluk">Net = D − Y/4</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Sayac etiket="Doğru" deger={dogru} ayarla={setDogru} renk="text-basarili" />
        <Sayac etiket="Yanlış" deger={yanlis} ayarla={setYanlis} renk="text-marka" />
        <Sayac etiket="Boş" deger={bos} ayarla={setBos} renk="text-soluk" />
      </div>

      <input
        value={notMetni}
        onChange={(e) => setNotMetni(e.target.value)}
        placeholder="Not (isteğe bağlı) — nerede zorlandın?"
        className="mt-3 w-full rounded-lg border border-cizgi px-3 py-2 text-sm"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={bekliyor}
          onClick={() =>
            calis(() => sayacBitir(okulSlug, oturum.id, { dogru, yanlis, bos }, notMetni))
          }
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white hover:bg-marka-koyu disabled:opacity-60"
        >
          Bitir ve Kaydet
        </button>
        <button
          type="button"
          disabled={bekliyor}
          onClick={() => calis(() => sayaciIptalEt(okulSlug, oturum.id))}
          className="rounded-lg border border-cizgi px-4 py-2 text-sm font-semibold hover:bg-zemin disabled:opacity-60"
        >
          İptal et
        </button>
      </div>
    </>
  );
}

function HedefBolumu({
  baslik,
  bosMetin,
  hedefler,
  okulSlug,
  bekliyor,
  calis,
  kapatilabilir,
}: {
  baslik: string;
  bosMetin: string;
  hedefler: Hedef[];
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
  kapatilabilir?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-soluk">
        {baslik} <span className="font-normal normal-case">({hedefler.length})</span>
      </h2>
      {hedefler.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-5 text-center text-sm text-soluk">
          {bosMetin}
        </div>
      ) : (
        <ul className="space-y-2">
          {hedefler.map((h) => {
            const yuzde = hedefYuzdesi(h);
            const kalan = kalanSoruMetni(h);
            return (
              <li key={h.id} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{h.baslik}</span>
                  <span className="text-sm text-soluk tabular-nums">
                    {h.cozulen}/{h.hedefSoru}
                  </span>
                </div>
                <div className="text-sm text-soluk">
                  {[h.ders, h.konu].filter(Boolean).join(" · ") || "Genel"}
                  {h.atayan ? ` · ${h.atayan}` : ""}
                  {h.sonTarih ? ` · son ${h.sonTarih}` : ""}
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zemin">
                  <div
                    className={`h-full rounded-full ${yuzde >= 100 ? "bg-basarili" : "bg-mavi"}`}
                    style={{ width: `${yuzde}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-soluk">
                    {kalan ?? "Hedef tamamlandı 🎉"}
                  </span>
                  {kapatilabilir ? (
                    <button
                      type="button"
                      disabled={bekliyor}
                      onClick={() => calis(() => hedefDurumu(okulSlug, h.id, "tamamlandi"))}
                      className="rounded-lg border border-cizgi px-2.5 py-1 text-xs font-semibold hover:bg-zemin disabled:opacity-60"
                    >
                      Kapat
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HedefFormu({
  okulSlug,
  bekliyor,
  calis,
}: {
  okulSlug: string;
  bekliyor: boolean;
  calis: Calis;
}) {
  const [acik, setAcik] = useState(false);
  const [baslik, setBaslik] = useState("");
  const [hedefSoru, setHedefSoru] = useState("30");

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="w-full rounded-kart border border-dashed border-cizgi bg-white py-3 text-sm font-semibold text-mavi hover:bg-zemin"
      >
        + Kendine hedef koy
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        calis(async () => {
          const s = await hedefEkle(okulSlug, { baslik, hedefSoru });
          if (s.basari) {
            setBaslik("");
            setHedefSoru("30");
            setAcik(false);
          }
          return s;
        });
      }}
      className="space-y-3 rounded-kart border border-cizgi bg-white p-4"
    >
      <h2 className="text-sm font-bold">Kendine hedef koy</h2>
      <label className="block text-sm font-semibold">
        Hedef
        <input
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder="Türev — zincir kuralı"
          required
          className="mt-1 block w-full rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="block text-sm font-semibold">
        Kaç soru?
        <input
          type="number"
          min={1}
          value={hedefSoru}
          onChange={(e) => setHedefSoru(e.target.value)}
          className="mt-1 block w-28 rounded-lg border border-cizgi px-3 py-2 text-sm font-normal"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={bekliyor}
          className="rounded-lg bg-marka px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Ekle
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
  );
}

function Sayac({
  etiket,
  deger,
  ayarla,
  renk,
}: {
  etiket: string;
  deger: number;
  ayarla: (f: (n: number) => number) => void;
  renk: string;
}) {
  return (
    <div className="rounded-kart border border-cizgi p-2 text-center">
      <div className="text-xs font-bold uppercase text-soluk">{etiket}</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={`${etiket} azalt`}
          onClick={() => ayarla((n) => Math.max(0, n - 1))}
          className="size-8 rounded-lg border border-cizgi text-lg font-bold leading-none hover:bg-zemin"
        >
          −
        </button>
        <span className={`text-xl font-extrabold tabular-nums ${renk}`}>{deger}</span>
        <button
          type="button"
          aria-label={`${etiket} artır`}
          onClick={() => ayarla((n) => Math.min(9999, n + 1))}
          className="size-8 rounded-lg border border-cizgi text-lg font-bold leading-none hover:bg-zemin"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Kutu({ deger, etiket }: { deger: string; etiket: string }) {
  return (
    <div className="rounded-kart border border-cizgi bg-white px-3 py-2 text-center">
      <div className="text-xl font-extrabold tabular-nums">{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}

function Uyari({ ton, children }: { ton: "olumlu" | "olumsuz"; children: React.ReactNode }) {
  const sinif =
    ton === "olumlu"
      ? "border-basarili/30 bg-basarili-acik text-basarili"
      : "border-marka/30 bg-marka-acik text-marka-koyu";
  return (
    <div className={`rounded-kart border p-3 text-sm font-semibold ${sinif}`}>{children}</div>
  );
}
