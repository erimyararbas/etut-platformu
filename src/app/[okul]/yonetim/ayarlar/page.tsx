import { rolZorunlu } from "@/lib/auth/oturum";
import { ayarlariOku } from "@/lib/yonetim/ayarlar";
import { AyarFormu } from "@/components/app/ayar-formu";

export default async function AyarlarSayfasi({ params }: PageProps<"/[okul]/yonetim/ayarlar">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "admin");
  const ayarlar = await ayarlariOku();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Ayarlar</h1>
        <p className="text-sm text-soluk">
          Buradaki değerler iş kurallarını doğrudan değiştirir; her değişiklik denetim
          kaydına yazılır.
        </p>
      </div>
      <AyarFormu okulSlug={slug} baslangic={ayarlar} />
    </div>
  );
}
