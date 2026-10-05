import { rolZorunlu } from "@/lib/auth/oturum";
import { okulunEtutleri } from "@/lib/etut/sorgular";
import { YonetimEtutListesi } from "@/components/app/yonetim-etut-listesi";

function bugunIstanbul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

export default async function YonetimEtutlerSayfasi({
  params,
}: PageProps<"/[okul]/yonetim/etutler">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "admin");
  const etutler = await okulunEtutleri(oturum.schoolId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Etütler</h1>
        <p className="text-sm text-soluk">
          Okulun tüm etütleri. İptal ettiğinizde kayıtlı öğrenciler, sırada bekleyenler ve
          velileri bilgilendirilir.
        </p>
      </div>
      <YonetimEtutListesi okulSlug={slug} etutler={etutler} bugun={bugunIstanbul()} />
    </div>
  );
}
