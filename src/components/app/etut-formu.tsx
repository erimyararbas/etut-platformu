"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HAFTA_GUNLERI,
  TEKRAR_SURELERI,
  saatSecenekleri,
  bitisSaati,
  birebirMi,
} from "@/lib/etut/kurallar";
import type { FormSecenekleri } from "@/lib/etut/sorgular";
import type { EtutActionDurumu } from "@/app/[okul]/ogretmen/actions";

const SAATLER = saatSecenekleri();

interface Props {
  secenekler: FormSecenekleri;
  bugun: string;
  eylem: (durum: EtutActionDurumu, formData: FormData) => Promise<EtutActionDurumu>;
}

export function EtutFormu({ secenekler, bugun, eylem }: Props) {
  const [durum, gonder, bekliyor] = useActionState(eylem, {} as EtutActionDurumu);

  /**
   * React 19 bir form action'ı bitince formu sıfırlar. Bizim formumuzda bazı
   * alanlar kontrollü (saat, sınıflar, periyot), bazıları değil (tarih, tür,
   * konu). Sıfırlama yalnızca kontrolsüz olanları temizlediği için form yarı
   * dolu kalıyor ve "Etüt Oluştur" sessizce çalışmıyordu: tür alanı boşalıyor,
   * required doğrulaması gönderimi engelliyor, kullanıcı sebebini göremiyordu.
   *
   * Çözüm: başarıdan sonra formu BÜTÜN olarak sıfırla (key ile yeniden kur) ve
   * kontrollü state'i de başlangıca döndür. Başarı mesajı formun dışında
   * durduğu için kaybolmaz; kullanıcı bir şey yazmaya başlayınca gizlenir.
   */
  const [formAnahtari, setFormAnahtari] = useState(0);
  const [mesajGizli, setMesajGizli] = useState(false);
  const sonBasari = useRef<string | undefined>(undefined);

  const [baslangic, setBaslangic] = useState("16:00");
  const [bitis, setBitis] = useState("17:00");
  const [sinifEtudu, setSinifEtudu] = useState(false);
  const [turId, setTurId] = useState("");
  const [periyot, setPeriyot] = useState<"tek_seferlik" | "haftalik">("tek_seferlik");
  const [seciliSiniflar, setSeciliSiniflar] = useState<string[]>([]);
  const [gunler, setGunler] = useState<number[]>([]);

  // Sınıf etüdünde kontenjan elle girilmez: seçilen sınıfların mevcudu kadardır.
  const mevcutToplami = secenekler.siniflar
    .filter((s) => seciliSiniflar.includes(s.id))
    .reduce((t, s) => t + s.mevcut, 0);

  // Birebir etüdün kontenjanı tanımı gereği 1; sorulmaz. Aynı hesap sunucuda
  // da yapılıyor (etutOlustur) — buradaki kilit kolaylık, kural değil.
  const birebir = birebirMi(secenekler.turler.find((t) => t.id === turId)?.ad);

  useEffect(() => {
    if (durum.basari && durum.basari !== sonBasari.current) {
      sonBasari.current = durum.basari;
      setBaslangic("16:00");
      setBitis("17:00");
      setSinifEtudu(false);
      setTurId("");
      setPeriyot("tek_seferlik");
      setSeciliSiniflar([]);
      setGunler([]);
      setMesajGizli(false);
      setFormAnahtari((k) => k + 1);
    }
  }, [durum.basari]);

  const degistir = (liste: string[], id: string) =>
    liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];

  return (
    <form
      key={formAnahtari}
      action={gonder}
      onChange={() => setMesajGizli(true)}
      className="space-y-6"
    >
      <Bolum baslik="Ders ve konu">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ders</Label>
            <div className="rounded-md border border-cizgi bg-zemin px-3 py-2 text-sm font-semibold">
              {secenekler.bransAdi}
            </div>
            <p className="text-xs text-muted-foreground">
              Yalnızca kendi branşınızdan etüt açabilirsiniz.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="konuId">Konu</Label>
            <select
              id="konuId"
              name="konuId"
              className="h-9 w-full rounded-md border border-cizgi bg-white px-3 text-sm"
            >
              <option value="">Konu seçilmedi</option>
              {secenekler.konular.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.seviye} · {k.ad}
                </option>
              ))}
            </select>
            {secenekler.konular.length === 0 && (
              <p className="text-xs text-uyari">
                Bu ders için tanımlı konu yok — yönetim TYMM dosyasını yüklemeli.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="aciklama">Açıklama · Etütte ne yapılacak?</Label>
          <textarea
            id="aciklama"
            name="aciklama"
            rows={2}
            maxLength={1000}
            placeholder="Zincir kuralı ağırlıklı soru çözümü — herkes deneme sorularını getirsin."
            className="w-full rounded-md border border-cizgi bg-white px-3 py-2 text-sm"
          />
        </div>
      </Bolum>

      <Bolum baslik="Zaman ve yer">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="tarih">Tarih</Label>
            <Input id="tarih" name="tarih" type="date" min={bugun} defaultValue={bugun} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baslangic">Başlangıç</Label>
            <select
              id="baslangic"
              name="baslangic"
              value={baslangic}
              onChange={(e) => {
                setBaslangic(e.target.value);
                // Bitişi otomatik bir saat sonraya çek; kullanıcı yine değiştirebilir.
                const yeni = bitisSaati(e.target.value, 60);
                if (yeni) setBitis(yeni);
              }}
              className="h-9 w-full rounded-md border border-cizgi bg-white px-3 text-sm"
            >
              {SAATLER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bitis">Bitiş</Label>
            <select
              id="bitis"
              name="bitis"
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              className="h-9 w-full rounded-md border border-cizgi bg-white px-3 text-sm"
            >
              {SAATLER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="derslikId">Derslik</Label>
          <select
            id="derslikId"
            name="derslikId"
            className="h-9 w-full max-w-xs rounded-md border border-cizgi bg-white px-3 text-sm"
          >
            <option value="">Derslik seçilmedi</option>
            {secenekler.derslikler.map((d) => (
              <option key={d.id} value={d.id}>
                {d.kod} ({d.kapasite} kişilik)
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Aynı derslik aynı saatte iki etüde verilemez.
          </p>
        </div>
      </Bolum>

      <Bolum baslik="Etüt türü ve katılım">
        <div className="space-y-2">
          <Label htmlFor="turId">Etüt Türü</Label>
          <select
            id="turId"
            name="turId"
            required
            value={turId}
            onChange={(e) => {
              setTurId(e.target.value);
              // Birebir seçilince sınıf etüdü işareti anlamsız kalır; ikisi
              // birlikte gönderilirse sunucu zaten reddediyor.
              if (birebirMi(secenekler.turler.find((t) => t.id === e.target.value)?.ad)) {
                setSinifEtudu(false);
              }
            }}
            className="h-9 w-full max-w-xs rounded-md border border-cizgi bg-white px-3 text-sm"
          >
            <option value="">Seçin…</option>
            {secenekler.turler.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ad}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Katılabilecek sınıflar</legend>
          <div className="flex flex-wrap gap-2">
            {secenekler.siniflar.map((s) => {
              const secili = seciliSiniflar.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`cursor-pointer rounded-chip border px-3 py-1.5 text-sm font-semibold ${
                    secili
                      ? "border-mavi bg-mavi-acik text-mavi"
                      : "border-cizgi bg-white text-ink-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="siniflar"
                    value={s.id}
                    checked={secili}
                    onChange={() => setSeciliSiniflar((l) => degistir(l, s.id))}
                    className="sr-only"
                  />
                  {s.kod}
                  <span className="ml-1 font-normal text-soluk">({s.mevcut})</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Yalnızca seçtiğiniz sınıfların öğrencileri bu etüdü görür ve rezerve edebilir.
          </p>
        </fieldset>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="sinifEtudu"
            checked={sinifEtudu}
            disabled={birebir}
            onChange={(e) => setSinifEtudu(e.target.checked)}
            className="mt-0.5"
          />
          <span className={birebir ? "text-soluk" : undefined}>
            <strong>Sınıf etüdü</strong> — seçilen sınıfların tüm öğrencileri otomatik
            eklenir, katılım zorunludur ve öğrenci kendini çıkaramaz.
            {birebir ? " (Birebir etütte seçilemez.)" : ""}
          </span>
        </label>

        <div className="mt-4 space-y-2">
          <Label htmlFor="kontenjan">Kontenjan</Label>
          {birebir ? (
            <>
              <div className="w-24 rounded-md border border-cizgi bg-zemin px-3 py-2 text-sm font-semibold">
                1
              </div>
              <input type="hidden" name="kontenjan" value={1} />
              <p className="text-xs text-muted-foreground">
                Birebir etüt tek öğrenciyle yapılır; kontenjan 1&apos;dir.
              </p>
            </>
          ) : sinifEtudu ? (
            <>
              <div className="w-24 rounded-md border border-cizgi bg-zemin px-3 py-2 text-sm font-semibold">
                {Math.max(mevcutToplami, 1)}
              </div>
              <input type="hidden" name="kontenjan" value={Math.max(mevcutToplami, 1)} />
              <p className="text-xs text-muted-foreground">
                Sınıf etüdünde kontenjan, seçilen sınıfların mevcuduna eşittir.
              </p>
            </>
          ) : (
            <Input
              id="kontenjan"
              name="kontenjan"
              type="number"
              min={1}
              max={500}
              defaultValue={12}
              required
              className="w-24"
            />
          )}
        </div>
      </Bolum>

      <Bolum baslik="Periyot">
        <div className="space-y-2">
          {(
            [
              ["tek_seferlik", "Tek seferlik", "Belirli bir gün ve saatte tek etüt açılır."],
              ["haftalik", "Haftalık tekrar", "Seçilen günlerde her hafta otomatik açılır."],
            ] as const
          ).map(([deger, baslik, aciklama]) => (
            <label
              key={deger}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                periyot === deger ? "border-mavi bg-mavi-acik" : "border-cizgi bg-white"
              }`}
            >
              <input
                type="radio"
                name="periyot"
                value={deger}
                checked={periyot === deger}
                onChange={() => setPeriyot(deger)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold">{baslik}</span>
                <span className="block text-xs text-soluk">{aciklama}</span>
              </span>
            </label>
          ))}
        </div>

        {periyot === "haftalik" && (
          <div className="mt-4 space-y-4 rounded-lg border border-cizgi bg-zemin p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Tekrar günleri</legend>
              <div className="flex flex-wrap gap-2">
                {HAFTA_GUNLERI.map((g) => {
                  const secili = gunler.includes(g.no);
                  return (
                    <label
                      key={g.no}
                      title={g.ad}
                      className={`w-11 cursor-pointer rounded-chip border py-1.5 text-center text-sm font-semibold ${
                        secili
                          ? "border-mavi bg-mavi text-white"
                          : "border-cizgi bg-white text-ink-2"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="gunler"
                        value={g.no}
                        checked={secili}
                        onChange={() => setGunler((l) => (secili ? l.filter((x) => x !== g.no) : [...l, g.no]))}
                        className="sr-only"
                      />
                      {g.kisa}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="haftaSayisi">Süre</Label>
              <select
                id="haftaSayisi"
                name="haftaSayisi"
                defaultValue={4}
                className="h-9 w-full max-w-xs rounded-md border border-cizgi bg-white px-3 text-sm"
              >
                {TEKRAR_SURELERI.map((s) => (
                  <option key={s.hafta} value={s.hafta}>
                    {s.etiket}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Seçilen tarihin haftasından başlar. Tarihten önceki günler atlanır.
              </p>
            </div>
          </div>
        )}
      </Bolum>

      {durum.hata && (
        <p role="alert" className="rounded-md bg-marka-acik px-3 py-2 text-sm text-marka-koyu">
          {durum.hata}
        </p>
      )}
      {durum.basari && !mesajGizli && (
        <p role="status" className="rounded-md bg-basarili-acik px-3 py-2 text-sm text-basarili">
          {durum.basari} Yeni bir etüt için form sıfırlandı.
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={bekliyor}>
          {bekliyor ? "Oluşturuluyor…" : "Etüdü Oluştur"}
        </Button>
      </div>
    </form>
  );
}

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="rounded-kart border border-cizgi bg-white p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-soluk">{baslik}</h2>
      {children}
    </section>
  );
}
