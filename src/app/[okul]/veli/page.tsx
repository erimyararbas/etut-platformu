import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { velininOgrencileri, etutGecmisi, ozetHesapla } from "@/lib/veli/sorgular";
import { YOKLAMA_ETIKET } from "@/lib/veli/gorunum";
import { bugun, tarihiYaz } from "@/lib/etut/kurallar";
import { calismaOzeti } from "@/lib/calisma/sorgular";
import { gunlukSeri, sureMetni } from "@/lib/calisma/gorunum";
import { puanOzeti } from "@/lib/calisma/puan";
import { GunlukCalismaGrafigi } from "@/components/app/gunluk-calisma-grafigi";
import { randevular } from "@/lib/rehberlik/sorgular";
import { ogrencininDenemeleri } from "@/lib/deneme/sorgular";
import { DenemeOzeti } from "@/components/app/deneme-ozeti";
import { RandevuTalepFormu } from "@/components/app/randevu-talep-formu";

export default async function VeliOzetSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/veli">) {
  const { okul: slug } = await params;
  const arama = await searchParams;
  await rolZorunlu(slug, "veli");

  const ogrenciler = await velininOgrencileri();

  if (ogrenciler.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-kart border border-cizgi bg-white p-6">
        <h1 className="font-bold">Bağlı öğrenci bulunamadı</h1>
        <p className="mt-1 text-sm text-soluk">
          Hesabınıza henüz bir öğrenci bağlanmamış. Okul yönetimine başvurun.
        </p>
      </div>
    );
  }

  const istenen = typeof arama.ogrenci === "string" ? arama.ogrenci : undefined;
  const ogrenci = ogrenciler.find((o) => o.id === istenen) ?? ogrenciler[0];

  // Veli çocuğunun çalışma kaydını da görür (0017: okuma geniş, yazma dar).
  // Etüt katılımı okulun tuttuğu kayıt; çalışma takibi öğrencinin kendi
  // beyanı — ikisi ayrı bölümlerde duruyor ki veli hangisinin ne olduğunu
  // karıştırmasın.
  const [gecmis, calisma, puan, randevuListesi, denemeler] = await Promise.all([
    etutGecmisi(ogrenci.id),
    calismaOzeti(ogrenci.id),
    puanOzeti(ogrenci.id),
    // Veli randevunun VARLIĞINI ve zamanını görür; görüşme notlarını görmez.
    randevular(ogrenci.id),
    // Deneme sonucu görüşme notu değil: veli görür (0027).
    ogrencininDenemeleri(ogrenci.id),
  ]);
  const bugunIso = bugun();
  const ozet = ozetHesapla(gecmis, bugunIso);

  const yaklasan = gecmis.filter((g) => g.tarih >= bugunIso).reverse();
  const gecmisEtutler = gecmis.filter((g) => g.tarih < bugunIso);
  const yorumlular = gecmis.filter((g) => g.yildiz !== null);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Birden çok çocuk varsa seçim */}
      {ogrenciler.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {ogrenciler.map((o) => (
            <Link
              key={o.id}
              href={`/${slug}/veli?ogrenci=${o.id}`}
              aria-current={o.id === ogrenci.id ? "page" : undefined}
              className={`rounded-chip border px-3 py-1.5 text-sm font-semibold ${
                o.id === ogrenci.id
                  ? "border-mavi bg-mavi-acik text-mavi"
                  : "border-cizgi bg-white text-ink-2"
              }`}
            >
              {o.ad} {o.soyad}
              {/* Kardeşlerin adı benzer olabilir; sınıf ayırt edici. */}
              {o.sinif && <span className="ml-1.5 font-normal text-soluk">{o.sinif}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-kart border border-cizgi bg-white p-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">
            {ogrenci.ad} {ogrenci.soyad}
          </h1>
          <p className="text-sm text-soluk">
            {ogrenci.okulNo}
            {ogrenci.sinif && ` · ${ogrenci.sinif}`}
          </p>
        </div>
        {/* Bu sayfa anlık durumu gösteriyor; rapor bir tarih aralığını
            dondurup yazdırılabilir hâle getiriyor (veli toplantısı için). */}
        <Link
          href={`/${slug}/rapor/${ogrenci.id}`}
          className="rounded-lg border border-cizgi px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Gelişim raporu
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kutu
          deger={ozet.katilimYuzdesi === null ? "—" : `%${ozet.katilimYuzdesi}`}
          etiket="Katılım"
          alt={
            ozet.katilimYuzdesi === null
              ? "yoklama alınmadı"
              : `${ozet.yoklananEtut} etütte`
          }
        />
        <Kutu deger={ozet.buAyEtut} etiket="Bu ay etüt" />
        <Kutu
          deger={ozet.devamsizlik}
          etiket="Devamsızlık"
          renk={ozet.devamsizlik > 0 ? "text-marka" : undefined}
          alt={ozet.mazeretli > 0 ? `${ozet.mazeretli} mazeretli` : undefined}
        />
        <Kutu
          deger={ozet.ortalamaYildiz === null ? "—" : `${ozet.ortalamaYildiz} ★`}
          etiket="Ort. yıldız"
          alt={ozet.degerlendirmeSayisi ? `${ozet.degerlendirmeSayisi} değerlendirme` : "henüz yok"}
        />
      </div>

      {/* ÇALIŞMA TAKİBİ — etüt kaydından ayrı bir bölüm.
          Etüde katılım okulun tuttuğu kayıttır; buradaki sayılar öğrencinin
          kendi girdiği beyandır. İkisini aynı kutuda göstermek veliye yanlış
          bir kesinlik hissi verirdi. */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
          Kendi çalışması
        </h2>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <Kutu deger={calisma.seri} etiket="günlük seri" />
          <Kutu deger={calisma.hafta.soru} etiket="bu hafta soru" />
          <Kutu deger={sureMetni(calisma.hafta.sureSaniye)} etiket="çalışma" />
        </div>

        <GunlukCalismaGrafigi
          seri={gunlukSeri(calisma.oturumlar, calisma.bugun)}
          bugun={calisma.bugun}
        />

        {puan.yildiz > 0 ? (
          <p className="mt-2 text-sm text-soluk">
            Öğretmenlerinden topladığı toplam yıldız:{" "}
            <span className="font-semibold text-ink">{puan.yildiz}</span>
            {puan.ortalama !== null ? ` · ortalama ${puan.ortalama}/5` : ""}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-soluk">
          Bu bölümdeki soru ve süre sayıları öğrencinin kendi girdiği kayıtlardır.
        </p>
      </section>

      <DenemeOzeti
        sonuclar={denemeler}
        aciklama="Deneme sonuçlarını rehberlik servisi girer."
      />

      <RandevuTalepFormu
        okulSlug={slug}
        ogrenciId={ogrenci.id}
        randevular={randevuListesi}
      />

      <Bolum baslik="Yaklaşan etütler" sayi={yaklasan.length}>
        {yaklasan.length === 0 ? (
          <Bos>Yaklaşan etüt kaydı yok.</Bos>
        ) : (
          <div className="space-y-2">
            {yaklasan.map((g) => (
              <div key={g.etutId} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{g.ders}</span>
                  {g.konu && <span className="text-sm text-soluk">· {g.konu}</span>}
                  {g.kayitDurumu === "atandi" && (
                    <span className="rounded-chip bg-lacivert-acik px-2 py-0.5 text-xs font-semibold text-lacivert">
                      Sınıf etüdü
                    </span>
                  )}
                  {g.kayitDurumu === "beklemede" && (
                    <span className="rounded-chip bg-uyari-acik px-2 py-0.5 text-xs font-semibold text-uyari">
                      Bekleme listesinde
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-soluk">
                  {tarihiYaz(g.tarih)} · {g.baslangic}–{g.bitis} · {g.ogretmen}
                  {g.derslik && ` · ${g.derslik}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Bolum>

      <Bolum baslik="Öğretmen değerlendirmeleri" sayi={yorumlular.length}>
        {yorumlular.length === 0 ? (
          <Bos>Henüz değerlendirme yapılmamış.</Bos>
        ) : (
          <div className="space-y-2">
            {yorumlular.map((g) => (
              <div key={g.etutId} className="rounded-kart border border-cizgi bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{g.ders}</span>
                  <span className="text-sm text-uyari" aria-label={`${g.yildiz} yıldız`}>
                    {"★".repeat(g.yildiz ?? 0)}
                    <span className="text-cizgi">{"★".repeat(5 - (g.yildiz ?? 0))}</span>
                  </span>
                  <span className="ml-auto text-xs text-soluk">{tarihiYaz(g.tarih)}</span>
                </div>
                <p className="mt-0.5 text-xs text-soluk">{g.ogretmen}</p>
                {g.hazirYorumlar.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.hazirYorumlar.map((h) => (
                      <span
                        key={h}
                        className="rounded-chip bg-mavi-acik px-2 py-0.5 text-xs font-semibold text-mavi"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                {g.yorum && <p className="mt-2 text-sm text-ink-2">{g.yorum}</p>}
              </div>
            ))}
          </div>
        )}
      </Bolum>

      <Bolum baslik="Geçmiş etütler" sayi={gecmisEtutler.length}>
        {gecmisEtutler.length === 0 ? (
          <Bos>Geçmiş etüt kaydı yok.</Bos>
        ) : (
          <ul className="divide-y divide-cizgi overflow-hidden rounded-kart border border-cizgi bg-white">
            {gecmisEtutler.map((g) => {
              const y = g.yoklama ? YOKLAMA_ETIKET[g.yoklama] : null;
              return (
                <li key={g.etutId} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight">
                      {g.ders}
                      {g.konu && <span className="font-normal text-soluk"> · {g.konu}</span>}
                    </div>
                    <div className="text-xs text-soluk">
                      {tarihiYaz(g.tarih)} · {g.baslangic} · {g.ogretmen}
                    </div>
                  </div>
                  <span
                    className={`rounded-chip px-2 py-1 text-xs font-bold ${
                      y?.sinif ?? "bg-zemin text-soluk"
                    }`}
                  >
                    {y?.metin ?? "Yoklama alınmadı"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Bolum>

      <p className="mt-6 text-center text-xs text-soluk">
        Yalnızca kendi öğrencinizin bilgilerini görebilirsiniz.
      </p>
    </div>
  );
}

function Bolum({
  baslik,
  sayi,
  children,
}: {
  baslik: string;
  sayi: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
        {baslik}
        <span className="ml-2 font-normal normal-case">({sayi})</span>
      </h2>
      {children}
    </section>
  );
}

function Bos({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-kart border border-dashed border-cizgi bg-white p-6 text-center text-sm text-soluk">
      {children}
    </div>
  );
}

function Kutu({
  deger,
  etiket,
  alt,
  renk,
}: {
  deger: string | number;
  etiket: string;
  alt?: string;
  renk?: string;
}) {
  return (
    <div className="rounded-kart border border-cizgi bg-white px-3 py-2.5">
      <div className={`text-xl font-extrabold ${renk ?? ""}`}>{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
      {alt && <div className="mt-0.5 text-[11px] text-soluk">{alt}</div>}
    </div>
  );
}
