import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { gonderiler } from "@/lib/calisma/gonderiler";
import { calismaOzeti } from "@/lib/calisma/sorgular";
import { ogrencininDenemeleri } from "@/lib/deneme/sorgular";
import { haftaninPlani } from "@/lib/plan/sorgular";
import { haftaBasi } from "@/lib/etut/takvim";
import { bugun } from "@/lib/etut/kurallar";
import { PlanPaneli } from "@/components/app/plan-paneli";
import { CalismaPaneli } from "@/components/app/calisma-paneli";
import { DenemeOzeti } from "@/components/app/deneme-ozeti";

export default async function CalismaSayfasi({ params }: PageProps<"/[okul]/ogrenci/calisma">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "ogrenci");
  const bugunIso = bugun();
  const [ozet, gonderilerim, denemeler, plan] = await Promise.all([
    calismaOzeti(oturum.kullaniciId),
    gonderiler(oturum.kullaniciId),
    ogrencininDenemeleri(oturum.kullaniciId),
    haftaninPlani(oturum.kullaniciId, haftaBasi(bugunIso)),
  ]);

  const bekleyen = gonderilerim.filter((g) => g.durum === "bekliyor").length;
  const geriGelen = gonderilerim.filter((g) => g.durum === "reddedildi").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold">Çalışmalarım</h1>
          <p className="text-sm text-soluk">Hedeflerin, soru sayacın ve çalışma geçmişin.</p>
        </div>
        {/* Öğrenci kendi raporunu görebilmeli: velisine ve öğretmenine giden
            rapor buysa, kendisinin de bilmesi gerekir. */}
        <Link
          href={`/${slug}/rapor/${oturum.kullaniciId}`}
          className="rounded-lg border border-cizgi bg-white px-3 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Gelişim raporum
        </Link>
      </div>
      {/* Gönderiler alt menüye ayrı bir öğe olarak konulmadı: telefonda alt bar
          altı öğeyle taşıyor ve gönderi zaten "Çalışmalarım"ın parçası. Geri
          gelen bir çalışma varsa kart kendini öne çıkarıyor. */}
      <Link
        href={`/${slug}/gonderiler`}
        className={`flex items-center justify-between gap-3 rounded-kart border p-4 hover:bg-zemin ${
          geriGelen > 0 ? "border-marka/30 bg-marka-acik" : "border-cizgi bg-white"
        }`}
      >
        <div>
          <div className="text-sm font-bold">Çalışma gönderilerim</div>
          <p className="text-sm text-soluk">
            {geriGelen > 0
              ? `${geriGelen} çalışman geri gönderildi — gerekçeye bak.`
              : bekleyen > 0
                ? `${bekleyen} gönderin mentörünün onayını bekliyor.`
                : "Çözdüğün soruların fotoğrafını mentörüne gönder."}
          </p>
        </div>
        <span aria-hidden="true" className="text-lg text-soluk">
          →
        </span>
      </Link>

      <PlanPaneli okulSlug={slug} plan={plan} bugun={bugunIso} />

      <CalismaPaneli okulSlug={slug} ozet={ozet} />

      <DenemeOzeti
        sonuclar={denemeler}
        aciklama="Deneme sonuçlarını rehberlik servisi girer; buradaki sayılar okulun kaydıdır."
      />
    </div>
  );
}
