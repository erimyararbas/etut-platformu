import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { formSecenekleri } from "@/lib/etut/sorgular";
import { bugun } from "@/lib/etut/kurallar";
import { EtutFormu } from "@/components/app/etut-formu";
import { etutOlustur, type EtutActionDurumu } from "../actions";

export default async function EtutOlusturSayfasi({
  params,
}: PageProps<"/[okul]/ogretmen/olustur">) {
  const { okul: slug } = await params;
  const oturum = await rolZorunlu(slug, "ogretmen");
  const secenekler = await formSecenekleri(oturum.kullaniciId);

  async function eylem(durum: EtutActionDurumu, formData: FormData) {
    "use server";
    return etutOlustur(slug, durum, formData);
  }

  if (!secenekler) {
    return (
      <div className="mx-auto max-w-2xl rounded-kart border border-cizgi bg-white p-6">
        <h1 className="font-bold">Öğretmen kaydınız bulunamadı</h1>
        <p className="mt-1 text-sm text-soluk">
          Branşınız tanımlı değil. Okul yönetiminin öğretmen listesini yüklemesi gerekiyor.
        </p>
      </div>
    );
  }

  const eksik: string[] = [];
  if (secenekler.turler.length === 0) eksik.push("etüt türü");
  if (secenekler.siniflar.length === 0) eksik.push("sınıf");

  if (eksik.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-kart border border-uyari/30 bg-uyari-acik p-6">
        <h1 className="font-bold">Önce okul verisi yüklenmeli</h1>
        <p className="mt-1 text-sm text-ink-2">
          Etüt açabilmek için tanımlı {eksik.join(" ve ")} gerekiyor. Okul yönetiminin ilgili
          Excel şablonlarını yüklemesi gerekiyor.
        </p>
        <Link
          href={`/${slug}/ogretmen`}
          className="mt-4 inline-block text-sm font-semibold text-mavi underline"
        >
          Etütlerime dön
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Etüt Oluştur</h1>
        <p className="text-sm text-soluk">
          Ders, tarih, kontenjan, tür ve katılabilecek sınıfları tek formda belirleyin.
        </p>
      </div>
      <EtutFormu secenekler={secenekler} bugun={bugun()} eylem={eylem} />
    </div>
  );
}
