import { rolZorunlu } from "@/lib/auth/oturum";
import { ogrencininEtutleri } from "@/lib/etut/ogrenci";
// Bugünün tarihi okulun saat diliminde hesaplanır, tarayıcınınkinde değil:
// yurt dışındaki bir veli veya seyahatteki bir öğrenci için "bugün" kaymamalı.
// Bu sayfa bir dönem kendi kopyasını taşıyordu; iki tanım aynı işi yapıyordu.
import { bugun } from "@/lib/etut/kurallar";
import { planOgeleri } from "@/lib/plan/sorgular";
import { EtutTakvimi } from "@/components/app/etut-takvimi";

export default async function TakvimSayfasi({ params }: PageProps<"/[okul]/ogrenci/takvim">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "ogrenci");
  const [etutler, planlar] = await Promise.all([
    ogrencininEtutleri(oturum.kullaniciId),
    planOgeleri(oturum.kullaniciId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Takvim</h1>
        <p className="text-sm text-soluk">
          Sana açık etütler, kayıtların ve haftalık çalışma planın. Aylık görünümde
          bir güne dokununca o günün kayıtları açılır; haftalık görünümde hepsi gün
          gün listelenir.
        </p>
      </div>
      <EtutTakvimi etutler={etutler} planOgeleri={planlar} bugun={bugun()} />
    </div>
  );
}
