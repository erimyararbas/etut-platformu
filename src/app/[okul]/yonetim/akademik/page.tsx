import { rolZorunlu } from "@/lib/auth/oturum";
import { akademikYapi } from "@/lib/yonetim/akademik";
import { AkademikYapiPaneli } from "@/components/app/akademik-yapi-paneli";

export default async function AkademikSayfasi({
  params,
}: PageProps<"/[okul]/yonetim/akademik">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "admin");
  const yapi = await akademikYapi();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Akademik Yapı</h1>
        <p className="text-sm text-soluk">
          Sınıflar, dersler, konular, derslikler ve etüt türleri. Bu listeler Excel
          şablonlarından gelir; değişiklik için şablonu güncelleyip yeniden yükleyin.
        </p>
      </div>
      <AkademikYapiPaneli yapi={yapi} />
    </div>
  );
}
