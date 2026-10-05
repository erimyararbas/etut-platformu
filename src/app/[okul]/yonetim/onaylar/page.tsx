import { rolZorunlu } from "@/lib/auth/oturum";
import { onayBekleyenler } from "@/lib/etut/sorgular";
import { supabaseSunucu } from "@/lib/supabase/server";
import { OnayKarti } from "@/components/app/onay-karti";
import { etudiOnayla, etudiReddet, type OnayDurumu } from "./actions";

export default async function OnaylarSayfasi({
  params,
}: PageProps<"/[okul]/yonetim/onaylar">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "admin");
  const etutler = await onayBekleyenler(oturum.schoolId);

  // Onay sırasında konu değiştirilebilsin diye tüm konular.
  const supabase = await supabaseSunucu();
  const { data: konuSatirlari } = await supabase
    .from("topics")
    .select("id, ad, subjects(ad), grade_levels(ad, sira)")
    .order("sira")
    .limit(1000);

  const konular = (konuSatirlari ?? []).map((k) => {
    const ders = k.subjects as unknown as { ad: string } | null;
    const seviye = k.grade_levels as unknown as { ad: string } | null;
    return { id: k.id, ad: k.ad, seviye: `${ders?.ad ?? ""} ${seviye?.ad ?? ""}`.trim() };
  });

  async function onayla(durum: OnayDurumu, formData: FormData) {
    "use server";
    return etudiOnayla(slug, durum, formData);
  }
  async function reddet(durum: OnayDurumu, formData: FormData) {
    "use server";
    return etudiReddet(slug, durum, formData);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">Etüt Onay Süreci</h1>
      <p className="mb-6 text-sm text-soluk">
        Onaylanana kadar etüt öğrencilere görünmez. Onaylamadan önce kontenjan, saat ve
        konuyu düzenleyebilirsiniz.
      </p>

      {etutler.length === 0 ? (
        <div className="rounded-kart border border-dashed border-cizgi bg-white p-8 text-center">
          <p className="font-semibold">Onay bekleyen etüt yok.</p>
          <p className="mt-1 text-sm text-soluk">
            Öğretmenler etüt açtıkça burada listelenecek.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {etutler.map((e) => (
            <OnayKarti
              key={e.id}
              etut={e}
              konular={konular}
              onayla={onayla}
              reddet={reddet}
            />
          ))}
        </div>
      )}
    </div>
  );
}
