import { rolZorunlu } from "@/lib/auth/oturum";
import { supabaseSunucu } from "@/lib/supabase/server";
import { ogrencilerinCalismasi } from "@/lib/calisma/ogretmen";
import { bugun } from "@/lib/etut/kurallar";
import { haftaBasi } from "@/lib/etut/takvim";
import { OgrenciCalismaTablosu } from "@/components/app/ogrenci-calisma-tablosu";

export default async function OgretmenCalismaSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/ogretmen/calisma">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "ogretmen");

  const sorgu = await searchParams;
  const simdi = bugun();
  const gecerli = (d: string | string[] | undefined, yedek: string) =>
    typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : yedek;

  // Varsayılan: içinde bulunulan hafta.
  const baslangic = gecerli(sorgu.baslangic, haftaBasi(simdi));
  const bitis = gecerli(sorgu.bitis, simdi);

  const supabase = await supabaseSunucu();
  const [ogrenciler, dersYanit] = await Promise.all([
    ogrencilerinCalismasi(baslangic, bitis),
    supabase.from("subjects").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Öğrenci Takibi</h1>
        <p className="text-sm text-soluk">
          {baslangic} – {bitis} arasındaki çalışma kayıtları. Soru sayıları öğrencinin
          kendi girdiği kayıtlardan gelir.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-kart border border-cizgi bg-white p-4">
        <label className="text-sm font-semibold">
          Başlangıç
          <input
            type="date"
            name="baslangic"
            defaultValue={baslangic}
            className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-semibold">
          Bitiş
          <input
            type="date"
            name="bitis"
            defaultValue={bitis}
            className="mt-1 block rounded-lg border border-cizgi px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-cizgi px-4 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Göster
        </button>
      </form>

      <OgrenciCalismaTablosu
        okulSlug={slug}
        ogrenciler={ogrenciler}
        bugun={simdi}
        dersler={dersYanit.data ?? []}
      />
    </div>
  );
}
