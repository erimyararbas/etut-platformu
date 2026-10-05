import { redirect } from "next/navigation";
import { oturumZorunlu } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { gonderiler } from "@/lib/calisma/gonderiler";
import { GonderiPaneli } from "@/components/app/gonderi-paneli";

export default async function GonderilerSayfasi({
  params,
}: PageProps<"/[okul]/gonderiler">) {
  const { okul: slug } = await params;
  const oturum = await oturumZorunlu(slug);

  const ogrenciMi = oturum.roller.includes("ogrenci");
  const personelMi = oturum.roller.some((r) =>
    ["ogretmen", "mentor", "rehber", "admin"].includes(r),
  );
  // Veli bu ekranı görmez: onay süreci öğrenciyle mentörü arasında.
  if (!ogrenciMi && !personelMi) redirect(`/${slug}`);

  const supabase = await supabaseSunucu();
  const [liste, hedefYanit] = await Promise.all([
    gonderiler(ogrenciMi ? oturum.kullaniciId : undefined),
    ogrenciMi
      ? supabase
          .from("study_goals")
          .select("id, baslik")
          .eq("student_id", oturum.kullaniciId)
          .eq("durum", "aktif")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; baslik: string }[] }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">
          {ogrenciMi ? "Çalışma Gönderilerim" : "Mentör Onay Kuyruğu"}
        </h1>
        <p className="text-sm text-soluk">
          {ogrenciMi
            ? "Çözdüğün soruların fotoğrafını gönder, mentörün onaylasın."
            : "Öğrencilerinin gönderdiği çalışma fotoğrafları."}
        </p>
      </div>
      <GonderiPaneli
        okulSlug={slug}
        rol={ogrenciMi ? "ogrenci" : "ogretmen"}
        gonderiler={liste}
        schoolId={oturum.schoolId}
        kullaniciId={oturum.kullaniciId}
        hedefler={hedefYanit.data ?? []}
      />
    </div>
  );
}
