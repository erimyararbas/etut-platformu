/**
 * Haftalık çalışma planı düzenleyicisi.
 *
 * Rol klasörlerinin DIŞINDA, `/rapor/[ogrenci]` ile aynı gerekçeyle: planı iki
 * ayrı rol yazıyor (rehber ve öğrencinin mentörü) ve düzenleyiciyi iki panele
 * kopyalamak, birinin güncellenip diğerinin unutulmasıyla iki farklı plan
 * formu bırakırdı.
 *
 * Kimin hangi öğrenciye yazabileceğine `plan_yazabilir()` karar veriyor
 * (0028). Burada yalnızca "personel mi" kapısı var; öğrenci veya veli bu
 * adrese gelirse boş forma bakmasın diye erken çevriliyor.
 */

import { notFound, redirect } from "next/navigation";
import { rolZorunlu } from "@/lib/auth/oturum";
import { okulZorunlu } from "@/lib/okul";
import { haftaBasi } from "@/lib/etut/takvim";
import { bugun } from "@/lib/etut/kurallar";
import { haftaninPlani } from "@/lib/plan/sorgular";
import { ogrenciDizini, dersListesi } from "@/lib/rehberlik/dizin";
import { supabaseSunucu } from "@/lib/supabase/server";
import { PlanDuzenleyici } from "@/components/app/plan-duzenleyici";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PlanSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/plan/[ogrenci]">) {
  const { okul: slug, ogrenci: ogrenciId } = await params;
  await okulZorunlu(slug);
  const oturum = await rolZorunlu(slug, "rehber", "ogretmen", "mentor", "admin");

  if (!UUID.test(ogrenciId)) notFound();

  const sorgu = await searchParams;
  const istenenHafta =
    typeof sorgu.hafta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sorgu.hafta)
      ? haftaBasi(sorgu.hafta)
      : haftaBasi(bugun());

  const supabase = await supabaseSunucu();
  const [plan, ogrenciler, dersler, konuYanit] = await Promise.all([
    haftaninPlani(ogrenciId, istenenHafta),
    ogrenciDizini(),
    dersListesi(),
    supabase.from("topics").select("id, ad, subject_id").order("sira"),
  ]);

  const ogrenci = ogrenciler.find((o) => o.id === ogrenciId);
  // Dizin `is_staff()` istiyor; saf mentör (öğretmen rolü olmayan) burada
  // öğrenciyi bulamaz. Böyle bir kullanıcı pratikte yok ama sessiz bir boş
  // ekran yerine kendi paneline dönmesi doğru.
  if (!ogrenci) redirect(`/${slug}`);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <PlanDuzenleyici
        okulSlug={slug}
        ogrenci={ogrenci}
        haftaBasi={istenenHafta}
        plan={plan}
        dersler={dersler}
        konular={konuYanit.data ?? []}
        rehberMi={oturum.roller.includes("rehber")}
      />
    </div>
  );
}
