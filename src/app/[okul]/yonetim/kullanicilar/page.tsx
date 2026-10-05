import { rolZorunlu } from "@/lib/auth/oturum";
import { kullanicilar, suzgecSayilari } from "@/lib/yonetim/kullanicilar";
import { KullaniciTablosu } from "@/components/app/kullanici-tablosu";

export default async function KullanicilarSayfasi({
  params,
}: PageProps<"/[okul]/yonetim/kullanicilar">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "admin");
  const liste = await kullanicilar();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Kullanıcılar</h1>
        <p className="text-sm text-soluk">
          Kullanıcılar Excel aktarımıyla eklenir. Buradan şifre sıfırlayabilir, hesap
          açıp kapatabilir, personele mentör ve rehber yetkisi verip alabilirsiniz.
        </p>
      </div>
      <KullaniciTablosu
        okulSlug={slug}
        kullanicilar={liste}
        sayilar={suzgecSayilari(liste)}
        kendiId={oturum.kullaniciId}
      />
    </div>
  );
}
