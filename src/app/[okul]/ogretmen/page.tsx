import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { ogretmeninEtutleri, onayimiBekleyenler } from "@/lib/etut/sorgular";
import { bugun, donem, type Donem } from "@/lib/etut/kurallar";
import { EtutKarti } from "@/components/app/etut-karti";
import { OnayimiBekleyenler } from "@/components/app/onayimi-bekleyenler";

const BASLIKLAR: Record<Donem, string> = {
  bugun: "Bugün",
  buHafta: "Bu hafta",
  gelecekHafta: "Gelecek hafta",
  ilerisi: "İleri tarihli",
  gecmis: "Geçmiş",
};

const SIRA: Donem[] = ["bugun", "buHafta", "gelecekHafta", "ilerisi", "gecmis"];

export default async function EtutlerimSayfasi({ params }: PageProps<"/[okul]/ogretmen">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "ogretmen");
  const [etutler, onayimBekleyen] = await Promise.all([
    ogretmeninEtutleri(oturum.kullaniciId),
    onayimiBekleyenler(oturum.kullaniciId),
  ]);

  const bugunIso = bugun();
  const gruplar = new Map<Donem, typeof etutler>();
  for (const e of etutler) {
    const d = donem(e.tarih, bugunIso);
    if (!gruplar.has(d)) gruplar.set(d, []);
    gruplar.get(d)!.push(e);
  }

  const yaklasan = etutler.filter((e) => e.tarih >= bugunIso && e.durum === "onaylandi");
  const bekleyen = etutler.filter((e) => e.durum === "onay_bekliyor");
  const toplamKayit = yaklasan.reduce((t, e) => t + e.dolu, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight">Etütlerim</h1>
          <p className="text-sm text-soluk">
            {oturum.ad} {oturum.soyad}
          </p>
        </div>
        <Link
          href={`/${slug}/ogretmen/olustur`}
          className="rounded-lg bg-marka px-4 py-2 text-sm font-semibold text-white hover:bg-marka-koyu"
        >
          + Etüt Oluştur
        </Link>
      </div>

      <OnayimiBekleyenler okulSlug={slug} etutler={onayimBekleyen} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kutu deger={yaklasan.length} etiket="Yaklaşan etüt" />
        <Kutu deger={toplamKayit} etiket="Kayıtlı öğrenci" />
        <Kutu
          deger={bekleyen.length}
          etiket="Onay bekleyen"
          renk={bekleyen.length ? "text-uyari" : undefined}
        />
      </div>

      {etutler.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-8 text-center">
          <p className="font-semibold">Henüz etüt oluşturmadınız.</p>
          <p className="mt-1 text-sm text-soluk">
            Öğrencilerin rezervasyon yapabilmesi için önce bir etüt açmanız gerekir.
          </p>
          <Link
            href={`/${slug}/ogretmen/olustur`}
            className="mt-4 inline-block rounded-lg bg-marka px-4 py-2 text-sm font-semibold text-white hover:bg-marka-koyu"
          >
            İlk etüdünü oluştur
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {SIRA.filter((d) => gruplar.has(d)).map((d) => (
            <section key={d}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soluk">
                {BASLIKLAR[d]}
                <span className="ml-2 font-normal normal-case">
                  ({gruplar.get(d)!.length})
                </span>
              </h2>
              <div className="space-y-3">
                {gruplar.get(d)!.map((e) => (
                  <EtutKarti key={e.id} etut={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Kutu({ deger, etiket, renk }: { deger: number; etiket: string; renk?: string }) {
  return (
    <div className="rounded-kart border border-cizgi bg-white px-4 py-3">
      <div className={`text-2xl font-extrabold ${renk ?? ""}`}>{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}
