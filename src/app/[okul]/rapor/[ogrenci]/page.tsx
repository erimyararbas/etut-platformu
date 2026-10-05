/**
 * Öğrenci gelişim raporu.
 *
 * Rol klasörlerinin DIŞINDA duruyor çünkü tek bir rolün sayfası değil:
 * öğrencinin kendisi, velisi, öğretmeni, rehberi ve yöneticisi aynı raporu
 * açar. Beş rol için beş kopya sayfa, beşi birden güncellenmediği gün
 * velinin gördüğü rapor ile öğretmenin gördüğü rapor ayrışırdı.
 *
 * Kimin hangi öğrenciyi açabileceğine RLS ve `ogrenciyi_gorebilir()` karar
 * veriyor (0025). Burada yalnızca oturum şartı var.
 *
 * Kabuk (sol menü / alt navigasyon) YOK: sayfa doğrudan yazdırılıyor ve
 * menünün kâğıda basılmasının anlamı olmaz.
 */

import { notFound } from "next/navigation";
import { oturumZorunlu } from "@/lib/auth/oturum";
import { okulZorunlu } from "@/lib/okul";
import { anaRol, rolAnaYolu } from "@/lib/navigasyon";
import {
  RaporYetkiHatasi,
  aralikDenemeleri,
  aralikEtutleri,
  dersBazindaCalisma,
  dersBazindaKatilim,
  ozetHesapla,
  raporVerisi,
  yorumlar,
} from "@/lib/rapor/gelisim";
import { GelisimRaporu } from "@/components/app/gelisim-raporu";
import { RaporAraclari } from "@/components/app/rapor-araclari";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Varsayılan aralık: son 30 gün.
 *
 * "İçinde bulunulan ay" olsaydı ayın 1'inde açılan rapor boş çıkardı — ve
 * raporun boş olmasıyla öğrencinin çalışmamış olması aynı şeye benzer.
 */
function varsayilanAralik(): { baslangic: string; bitis: string } {
  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const d = new Date(`${bugun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29);
  return { baslangic: d.toISOString().slice(0, 10), bitis: bugun };
}

function Uyari({ baslik, metin }: { baslik: string; metin: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-kart border border-cizgi bg-white p-6 text-center">
        <h1 className="font-bold">{baslik}</h1>
        <p className="mt-2 text-sm text-soluk">{metin}</p>
      </div>
    </div>
  );
}

export default async function GelisimRaporuSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/rapor/[ogrenci]">) {
  const { okul: slug, ogrenci: ogrenciId } = await params;
  await okulZorunlu(slug);
  const o = await oturumZorunlu(slug);

  if (!UUID.test(ogrenciId)) notFound();

  const sorgu = await searchParams;
  const v = varsayilanAralik();
  const tarih = (deger: string | string[] | undefined, yedek: string) =>
    typeof deger === "string" && TARIH.test(deger) ? deger : yedek;

  let baslangic = tarih(sorgu.baslangic, v.baslangic);
  let bitis = tarih(sorgu.bitis, v.bitis);
  // Ters aralık hata değil, kullanıcı hatası: sessizce düzeltmek raporu
  // boş göstermekten iyi.
  if (baslangic > bitis) [baslangic, bitis] = [bitis, baslangic];

  let veri: Awaited<ReturnType<typeof raporVerisi>>;
  try {
    veri = await raporVerisi(ogrenciId, baslangic, bitis);
  } catch (hata) {
    if (hata instanceof RaporYetkiHatasi) {
      return (
        <Uyari
          baslik="Bu raporu görüntüleyemezsiniz"
          metin="Yalnızca öğrencinin kendisi, velisi ve okulundaki yetkili personel bu raporu açabilir."
        />
      );
    }
    throw hata;
  }

  if (!veri.kimlik) notFound();

  const etutler = aralikEtutleri(veri.gecmis, baslangic, bitis);
  const denemeler = aralikDenemeleri(veri.denemeler, baslangic, bitis);
  const geriYol = rolAnaYolu(slug, anaRol(o));

  const olusturulma = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="min-h-dvh bg-zemin print:bg-white">
      <RaporAraclari baslangic={baslangic} bitis={bitis} geriYol={geriYol} />
      <div className="p-4 print:p-0">
        <GelisimRaporu
          kimlik={veri.kimlik}
          baslangic={baslangic}
          bitis={bitis}
          ozet={ozetHesapla(etutler, veri.calisma)}
          katilim={dersBazindaKatilim(etutler)}
          calisma={dersBazindaCalisma(veri.calisma)}
          hedef={veri.hedef}
          yorumlar={yorumlar(etutler)}
          etutler={etutler}
          denemeler={denemeler}
          olusturulma={olusturulma}
        />
      </div>
    </div>
  );
}
