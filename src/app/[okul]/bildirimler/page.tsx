import { oturumZorunlu } from "@/lib/auth/oturum";
import { bildirimler } from "@/lib/bildirim/sorgular";
import { anaRol } from "@/lib/navigasyon";
import { BildirimListesi } from "@/components/app/bildirim-listesi";

export default async function BildirimlerSayfasi({
  params,
}: PageProps<"/[okul]/bildirimler">) {
  const { okul: slug } = await params;
  const oturum = await oturumZorunlu(slug);
  const liste = await bildirimler();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-extrabold">Bildirimler</h1>
      <BildirimListesi
        okulSlug={slug}
        rol={anaRol(oturum) ?? ""}
        bildirimler={liste}
      />
    </div>
  );
}
