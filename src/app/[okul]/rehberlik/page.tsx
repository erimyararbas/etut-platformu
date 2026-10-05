import { rolZorunlu } from "@/lib/auth/oturum";
import { riskKuyrugu, vakalar, vakaNotlari, randevular } from "@/lib/rehberlik/sorgular";
import { denemeler, denemeSonuclari } from "@/lib/deneme/sorgular";
import { ogrenciDizini, dersListesi } from "@/lib/rehberlik/dizin";
import { talepler as etutTalepleriniOku } from "@/lib/etut/talep";
import { bugun } from "@/lib/etut/kurallar";
import { RehberlikPaneli } from "@/components/app/rehberlik-paneli";

export default async function RehberlikSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/rehberlik">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "rehber");

  const sorgu = await searchParams;
  const uuid = (d: unknown) =>
    typeof d === "string" && /^[0-9a-f-]{36}$/i.test(d) ? d : null;

  const seciliVaka = uuid(sorgu.vaka);
  const seciliDeneme = uuid(sorgu.deneme);

  const [risk, vakaListesi, randevuListesi, notlar, denemeListesi, ogrenciler, dersler] =
    await Promise.all([
      riskKuyrugu(),
      vakalar(),
      randevular(),
      seciliVaka ? vakaNotlari(seciliVaka) : Promise.resolve([]),
      denemeler(),
      ogrenciDizini(),
      dersListesi(),
    ]);

  const etutTalepleri = await etutTalepleriniOku();

  // Seçili deneme yoksa en yenisi gösterilir: rehberin bakacağı sınav
  // neredeyse her zaman sonuncusudur.
  const acikDeneme = seciliDeneme ?? denemeListesi[0]?.id ?? null;
  const sonuclar = acikDeneme ? await denemeSonuclari(acikDeneme) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <RehberlikPaneli
        okulSlug={slug}
        bugun={bugun()}
        risk={risk}
        vakalar={vakaListesi}
        randevular={randevuListesi}
        notlar={notlar}
        seciliVaka={seciliVaka}
        denemeler={denemeListesi}
        seciliDeneme={acikDeneme}
        denemeSonuclari={sonuclar}
        ogrenciler={ogrenciler}
        dersler={dersler}
        etutTalepleri={etutTalepleri}
      />
    </div>
  );
}
