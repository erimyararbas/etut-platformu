/**
 * Rehberin etüt açma formu.
 *
 * Öğretmenin `/ogretmen/olustur` formu yeniden kullanılmadı ve bu bilinçli:
 * alanların yarısı farklı. Orada ders öğretmenin branşından geliyor ve
 * seçilmiyor; burada önce ÖĞRETMEN seçiliyor, ders ondan türüyor. Orada
 * "katılabilecek sınıflar" var; burada tek tek ÖĞRENCİ seçiliyor. Ortak olan
 * saat/süre/kontenjan kuralları `lib/etut/kurallar.ts`ten paylaşılıyor.
 */

import { redirect } from "next/navigation";
import { rolZorunlu } from "@/lib/auth/oturum";
import { okulZorunlu } from "@/lib/okul";
import { bugun } from "@/lib/etut/kurallar";
import { supabaseSunucu } from "@/lib/supabase/server";
import { ogrenciDizini, ogretmenDizini } from "@/lib/rehberlik/dizin";
import { RehberEtutFormu } from "@/components/app/rehber-etut-formu";

export default async function RehberEtutAcSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/rehberlik/etut-ac">) {
  const { okul: slug } = await params;
  await okulZorunlu(slug);
  await rolZorunlu(slug, "rehber");

  const sorgu = await searchParams;
  const talepId =
    typeof sorgu.talep === "string" && /^[0-9a-f-]{36}$/i.test(sorgu.talep)
      ? sorgu.talep
      : null;

  const supabase = await supabaseSunucu();
  const [ogretmenler, ogrenciler, dersYanit, turYanit, odaYanit, konuYanit, talepYanit] =
    await Promise.all([
      ogretmenDizini(),
      ogrenciDizini(),
      supabase.from("subjects").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("etut_types").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("rooms").select("id, kod, kapasite").eq("aktif", true).order("kod"),
      supabase.from("topics").select("id, ad, subject_id").order("sira"),
      talepId
        ? supabase
            .from("etut_requests")
            .select("id, student_id, subject_id, topic_id, neden, durum")
            .eq("id", talepId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (!ogretmenler.length) redirect(`/${slug}/rehberlik`);

  const talep = talepYanit.data;
  // Karara bağlanmış talebin formunu açmak, ikinci bir etüt açılmasına yol
  // açardı; rehber kuyruğa geri gönderiliyor.
  const acikTalep = talep && talep.durum === "bekliyor" ? talep : null;

  return (
    <div className="mx-auto max-w-3xl">
      <RehberEtutFormu
        okulSlug={slug}
        bugun={bugun()}
        ogretmenler={ogretmenler}
        ogrenciler={ogrenciler}
        dersler={dersYanit.data ?? []}
        turler={turYanit.data ?? []}
        derslikler={odaYanit.data ?? []}
        konular={konuYanit.data ?? []}
        talep={
          acikTalep
            ? {
                id: acikTalep.id as string,
                ogrenciId: acikTalep.student_id as string,
                dersId: (acikTalep.subject_id as string | null) ?? "",
                konuId: (acikTalep.topic_id as string | null) ?? "",
                neden: acikTalep.neden as string,
              }
            : null
        }
      />
    </div>
  );
}
