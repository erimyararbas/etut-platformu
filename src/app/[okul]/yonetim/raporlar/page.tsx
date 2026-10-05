import { rolZorunlu } from "@/lib/auth/oturum";
import { katilimSatirlari, ogrenciOzetleri } from "@/lib/rapor/katilim";
import { RaporPaneli } from "@/components/app/rapor-paneli";

/** Varsayılan aralık: içinde bulunulan ay. */
function varsayilanAralik(): { baslangic: string; bitis: string } {
  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const yil = Number(bugun.slice(0, 4));
  const ay = Number(bugun.slice(5, 7));
  const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  const iki = (n: number) => String(n).padStart(2, "0");
  return {
    baslangic: `${yil}-${iki(ay)}-01`,
    bitis: `${yil}-${iki(ay)}-${iki(sonGun)}`,
  };
}

export default async function RaporlarSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/yonetim/raporlar">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "admin");

  const sorgu = await searchParams;
  const v = varsayilanAralik();
  const tarih = (deger: string | string[] | undefined, yedek: string) =>
    typeof deger === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deger) ? deger : yedek;

  const baslangic = tarih(sorgu.baslangic, v.baslangic);
  const bitis = tarih(sorgu.bitis, v.bitis);

  // Önizleme indirmeden önce "doğru aralığı seçtim mi" sorusunu yanıtlıyor.
  const gecerliAralik = baslangic <= bitis;
  const satirlar = gecerliAralik ? await katilimSatirlari(baslangic, bitis) : [];
  const ozetler = ogrenciOzetleri(satirlar);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">Raporlar</h1>
        <p className="text-sm text-soluk">
          Seçtiğiniz tarih aralığındaki yoklama ve değerlendirme kayıtları. Excel
          dosyasında özet, satır satır ayrıntı ve hesap açıklaması olmak üzere üç
          sayfa bulunur.
        </p>
      </div>
      <RaporPaneli
        okulSlug={slug}
        baslangic={baslangic}
        bitis={bitis}
        gecerliAralik={gecerliAralik}
        kayitSayisi={satirlar.length}
        ozetler={ozetler}
      />
    </div>
  );
}
