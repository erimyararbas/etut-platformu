/**
 * Gelişim raporunun gövdesi — ekranda da, baskıda da aynı işaretleme.
 *
 * Ayrı bir "yazdırma sürümü" YOK. İki sürüm olsaydı biri güncellenip diğeri
 * unutulurdu ve velinin elindeki PDF, ekranda olmayan bir sayı gösterirdi.
 * Fark yalnız CSS tarafında: `print:` varyantları ve globals.css içindeki
 * `@media print` bloğu.
 *
 * REHBERLİK VERİSİ BURAYA GİRMEZ (bkz. 0025 başlığı). Bu rapor veliye de
 * gider; görüşme notları yalnız rehberlik servisine açıktır.
 */

import type {
  DersCalismasi,
  DersKatilimi,
  EtutGecmisi,
  HedefOzeti,
  Kimlik,
  RaporOzeti,
} from "@/lib/rapor/gelisim-gorunum";
import { YOKLAMA_ADI, sureMetni, tarihKisa, tarihUzun } from "@/lib/rapor/gelisim-gorunum";
import type { DenemeSonucu } from "@/lib/deneme/gorunum";

interface Props {
  kimlik: Kimlik;
  baslangic: string;
  bitis: string;
  ozet: RaporOzeti;
  katilim: DersKatilimi[];
  calisma: DersCalismasi[];
  hedef: HedefOzeti;
  yorumlar: EtutGecmisi[];
  etutler: EtutGecmisi[];
  /** Aralığa düşen denemeler, yeniden eskiye. */
  denemeler: DenemeSonucu[];
  olusturulma: string;
}

function Kutu({
  etiket,
  deger,
  alt,
  vurgu,
}: {
  etiket: string;
  deger: string;
  alt?: string;
  vurgu?: boolean;
}) {
  return (
    <div className="kagit-blok rounded-kart border border-cizgi p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-soluk">
        {etiket}
      </div>
      <div
        className={`mt-1 text-xl font-extrabold ${vurgu ? "text-marka" : "text-lacivert"}`}
      >
        {deger}
      </div>
      {alt ? <div className="mt-0.5 text-[11px] text-soluk">{alt}</div> : null}
    </div>
  );
}

function Bolum({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-lacivert">
        {baslik}
      </h2>
      {aciklama ? <p className="mt-0.5 text-[11px] text-soluk">{aciklama}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const TH = "px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide";
const TD = "px-2 py-1.5 align-top";

function Bos({ metin }: { metin: string }) {
  return (
    <p className="rounded-kart border border-dashed border-cizgi px-3 py-4 text-center text-xs text-soluk">
      {metin}
    </p>
  );
}

export function GelisimRaporu({
  kimlik,
  baslangic,
  bitis,
  ozet,
  katilim,
  calisma,
  hedef,
  yorumlar,
  etutler,
  denemeler,
  olusturulma,
}: Props) {
  const enCokSoru = Math.max(1, ...calisma.map((c) => c.soru));

  return (
    <article className="rapor mx-auto max-w-[210mm] bg-white p-6 text-ink print:max-w-none print:p-0">
      {/* Başlık bandı */}
      <header className="kagit-blok rounded-kart bg-lacivert px-5 py-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
          {kimlik.okulAdi}
        </div>
        <h1 className="mt-0.5 text-xl font-extrabold">Öğrenci Gelişim Raporu</h1>
        <div className="mt-1 text-xs text-white/80">
          {tarihUzun(baslangic)} – {tarihUzun(bitis)}
        </div>
      </header>

      {/* Kimlik */}
      <div className="kagit-blok mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-kart border border-cizgi p-4 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[11px] font-bold uppercase text-soluk">Öğrenci</div>
          <div className="font-bold">
            {kimlik.ad} {kimlik.soyad}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase text-soluk">Okul No</div>
          <div className="font-semibold">{kimlik.okulNo}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase text-soluk">Sınıf</div>
          <div className="font-semibold">{kimlik.sinif ?? "—"}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase text-soluk">Mentör</div>
          <div className="font-semibold">{kimlik.mentor ?? "—"}</div>
        </div>
      </div>

      {/* Özet */}
      <Bolum
        baslik="Özet"
        aciklama="Katılım yüzdesi = katıldığı ÷ (katıldığı + devamsız olduğu). Mazeretli devamsızlık hesaba katılmaz."
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Kutu
            etiket="Katılım"
            deger={ozet.katilimYuzdesi === null ? "—" : `%${ozet.katilimYuzdesi}`}
            alt={`${ozet.katildi}/${ozet.katildi + ozet.devamsiz} etüt`}
          />
          <Kutu
            etiket="Devamsız"
            deger={String(ozet.devamsiz)}
            alt={ozet.mazeretli > 0 ? `${ozet.mazeretli} mazeretli` : undefined}
            vurgu={ozet.devamsiz > 0}
          />
          <Kutu
            etiket="Ort. Yıldız"
            deger={ozet.ortalamaYildiz === null ? "—" : `${ozet.ortalamaYildiz}`}
            alt={`${ozet.degerlendirmeSayisi} değerlendirme`}
          />
          <Kutu
            etiket="Çözülen Soru"
            deger={ozet.soru.toLocaleString("tr-TR")}
            alt={`${ozet.net} net`}
          />
          <Kutu etiket="Çalışma Süresi" deger={sureMetni(ozet.sureSaniye)} />
          <Kutu etiket="Çalışılan Gün" deger={String(ozet.calisilanGun)} />
        </div>

        {ozet.yoklanmayanEtut > 0 ? (
          <p className="mt-2 text-[11px] text-soluk">
            Bu aralıktaki {ozet.yoklanmayanEtut} etüdün yoklaması henüz alınmamış;
            yüzdelere girmiyor.
          </p>
        ) : null}
      </Bolum>

      {/* Ders bazında katılım */}
      <Bolum baslik="Ders Bazında Katılım">
        {katilim.length === 0 ? (
          <Bos metin="Bu aralıkta yoklaması alınmış etüt yok." />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="border-b border-cizgi bg-zemin text-soluk">
              <tr>
                <th className={TH}>Ders</th>
                <th className={TH}>Etüt</th>
                <th className={TH}>Katıldı</th>
                <th className={TH}>Devamsız</th>
                <th className={TH}>Mazeretli</th>
                <th className={TH}>Katılım</th>
                <th className={TH}>Ort. Yıldız</th>
              </tr>
            </thead>
            <tbody>
              {katilim.map((d) => (
                <tr key={d.ders} className="border-b border-cizgi last:border-0">
                  <td className={`${TD} font-semibold`}>{d.ders}</td>
                  <td className={TD}>{d.toplam}</td>
                  <td className={TD}>{d.katildi}</td>
                  <td className={`${TD} ${d.devamsiz > 0 ? "font-bold text-marka" : ""}`}>
                    {d.devamsiz}
                  </td>
                  <td className={TD}>{d.mazeretli}</td>
                  <td className={`${TD} font-semibold`}>
                    {d.katilimYuzdesi === null ? "—" : `%${d.katilimYuzdesi}`}
                  </td>
                  <td className={TD}>{d.ortalamaYildiz ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bolum>

      {/* Çalışma */}
      <Bolum
        baslik="Ders Bazında Çalışma"
        aciklama="Öğrencinin kendi girdiği çalışma kayıtları. Net = doğru − yanlış/4. Çubuklar çözülen soru sayısını gösterir."
      >
        {calisma.length === 0 ? (
          <Bos metin="Bu aralıkta çalışma kaydı girilmemiş." />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="border-b border-cizgi bg-zemin text-soluk">
              <tr>
                <th className={TH}>Ders</th>
                <th className={`${TH} w-[45%]`}>Çözülen Soru</th>
                <th className={TH}>Net</th>
                <th className={TH}>Süre</th>
              </tr>
            </thead>
            <tbody>
              {calisma.map((c) => (
                <tr key={c.ders} className="border-b border-cizgi last:border-0">
                  <td className={`${TD} font-semibold`}>{c.ders}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-full bg-zemin">
                        <div
                          className="h-2.5 rounded-full bg-mavi"
                          style={{ width: `${Math.round((c.soru / enCokSoru) * 100)}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                        {c.soru.toLocaleString("tr-TR")}
                      </span>
                    </div>
                  </td>
                  <td className={`${TD} tabular-nums`}>{c.net}</td>
                  <td className={TD}>{sureMetni(c.sureSaniye)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-2 text-[11px] text-soluk">
          Hedefler: {hedef.aktif} aktif · {hedef.tamamlandi} tamamlandı
          {hedef.ogretmenden > 0
            ? ` · ${hedef.ogretmenden} tanesini öğretmen verdi`
            : ""}
        </p>
      </Bolum>

      {/* Denemeler */}
      <Bolum
        baslik="Deneme Sınavları"
        aciklama="Rehberlik servisinin girdiği sonuçlar. Net = doğru − yanlış/4."
      >
        {denemeler.length === 0 ? (
          <Bos metin="Bu aralıkta deneme sonucu girilmemiş." />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="border-b border-cizgi bg-zemin text-soluk">
              <tr>
                <th className={TH}>Tarih</th>
                <th className={TH}>Deneme</th>
                <th className={TH}>Ders Kırılımı</th>
                <th className={TH}>Puan</th>
                <th className={`${TH} text-right`}>Toplam Net</th>
              </tr>
            </thead>
            <tbody>
              {denemeler.map((d) => (
                <tr key={d.examId} className="border-b border-cizgi last:border-0">
                  <td className={`${TD} whitespace-nowrap`}>{tarihKisa(d.tarih)}</td>
                  <td className={`${TD} font-semibold`}>
                    {d.ad}
                    {d.tur ? <span className="ml-1 font-normal text-soluk">{d.tur}</span> : null}
                  </td>
                  <td className={`${TD} text-soluk`}>
                    {d.dersler.map((x) => `${x.ders} ${x.net}`).join(" · ")}
                  </td>
                  <td className={`${TD} tabular-nums text-soluk`}>{d.puan ?? "—"}</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>{d.toplamNet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bolum>

      {/* Öğretmen yorumları */}
      <Bolum baslik="Öğretmen Değerlendirmeleri">
        {yorumlar.length === 0 ? (
          <Bos metin="Bu aralıkta yazılı değerlendirme yok." />
        ) : (
          <ul className="space-y-2">
            {yorumlar.map((y) => (
              <li
                key={y.etutId}
                className="kagit-blok rounded-kart border border-cizgi p-3 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {y.ders}
                    <span className="ml-2 font-normal text-soluk">{y.ogretmen}</span>
                  </span>
                  <span className="text-soluk">
                    {tarihKisa(y.tarih)}
                    {y.yildiz !== null ? ` · ${y.yildiz}/5` : ""}
                  </span>
                </div>
                {y.hazirYorumlar.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {y.hazirYorumlar.map((h) => (
                      <span
                        key={h}
                        className="rounded-chip bg-lacivert-acik px-2 py-0.5 text-[11px] font-semibold text-lacivert"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                ) : null}
                {y.yorum ? <p className="mt-1.5 leading-relaxed">{y.yorum}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Bolum>

      {/* Etüt dökümü */}
      <Bolum baslik="Etüt Dökümü">
        {etutler.length === 0 ? (
          <Bos metin="Bu aralıkta etüt kaydı yok." />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="border-b border-cizgi bg-zemin text-soluk">
              <tr>
                <th className={TH}>Tarih</th>
                <th className={TH}>Saat</th>
                <th className={TH}>Ders</th>
                <th className={TH}>Konu</th>
                <th className={TH}>Öğretmen</th>
                <th className={TH}>Durum</th>
                <th className={TH}>Yıldız</th>
              </tr>
            </thead>
            <tbody>
              {etutler.map((e) => (
                <tr key={e.etutId} className="border-b border-cizgi last:border-0">
                  <td className={`${TD} whitespace-nowrap`}>{tarihKisa(e.tarih)}</td>
                  <td className={`${TD} whitespace-nowrap text-soluk`}>
                    {e.baslangic}–{e.bitis}
                  </td>
                  <td className={`${TD} font-semibold`}>{e.ders}</td>
                  <td className={`${TD} text-soluk`}>{e.konu ?? "—"}</td>
                  <td className={`${TD} text-soluk`}>{e.ogretmen}</td>
                  <td className={TD}>
                    {e.yoklama === null ? (
                      <span className="text-soluk">Yoklama alınmadı</span>
                    ) : (
                      <span
                        className={
                          e.yoklama === "devamsiz"
                            ? "font-bold text-marka"
                            : e.yoklama === "katildi"
                              ? "font-semibold text-basarili"
                              : "text-soluk"
                        }
                      >
                        {YOKLAMA_ADI[e.yoklama]}
                      </span>
                    )}
                  </td>
                  <td className={TD}>{e.yildiz ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bolum>

      <footer className="mt-6 border-t border-cizgi pt-3 text-[10px] leading-relaxed text-soluk">
        <p>
          Bu rapor {olusturulma} tarihinde oluşturulmuştur ve oluşturulduğu andaki
          kayıtları yansıtır. Çalışma kayıtları öğrencinin kendi beyanıdır.
        </p>
        <p className="mt-1">Rehberlik görüşme kayıtları bu rapora dâhil değildir.</p>
      </footer>
    </article>
  );
}
