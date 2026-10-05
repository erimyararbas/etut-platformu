import { redirect } from "next/navigation";
import { oturumZorunlu } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { sorular } from "@/lib/calisma/sorular";
import { SorularPaneli } from "@/components/app/sorular-paneli";

export default async function SorularSayfasi({ params }: PageProps<"/[okul]/sorular">) {
  const { okul: slug } = await params;
  const oturum = await oturumZorunlu(slug);

  const ogrenciMi = oturum.roller.includes("ogrenci");
  const personelMi = oturum.roller.some((r) =>
    ["ogretmen", "mentor", "rehber", "admin"].includes(r),
  );
  // Veli bu ekranı görmez: çocuğunun takıldığı soru öğretmeniyle arasında.
  if (!ogrenciMi && !personelMi) redirect(`/${slug}`);

  const supabase = await supabaseSunucu();
  const [liste, dersYanit] = await Promise.all([
    sorular(ogrenciMi ? oturum.kullaniciId : undefined),
    supabase.from("subjects").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Çözemediğim Sorular</h1>
        <p className="text-sm text-soluk">
          {ogrenciMi
            ? "Takıldığın soruyu yaz, öğretmenlerin yanıtlasın."
            : "Öğrencilerin takıldığı sorular. Yanıtın doğrudan öğrenciye gider."}
        </p>
      </div>
      <SorularPaneli
        okulSlug={slug}
        rol={ogrenciMi ? "ogrenci" : "ogretmen"}
        sorular={liste}
        dersler={dersYanit.data ?? []}
        schoolId={oturum.schoolId}
        kullaniciId={oturum.kullaniciId}
      />
    </div>
  );
}
