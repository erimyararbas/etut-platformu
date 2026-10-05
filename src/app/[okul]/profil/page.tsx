import { oturumZorunlu } from "@/lib/auth/oturum";
import { profilOku } from "@/lib/profil";
import { ROL_ADI } from "@/lib/yonetim/kullanici-gorunum";
import { SifreDegistirFormu } from "@/components/app/sifre-degistir-formu";

export default async function ProfilSayfasi({ params }: PageProps<"/[okul]/profil">) {
  const { okul: slug } = await params;
  const oturum = await oturumZorunlu(slug);
  const p = await profilOku(oturum);

  const satirlar = [
    { etiket: "Ad Soyad", deger: `${p.ad} ${p.soyad}` },
    { etiket: "Rol", deger: p.roller.map((r) => ROL_ADI[r] ?? r).join(", ") },
    ...p.ayrintilar,
    ...(p.eposta ? [{ etiket: "E-posta", deger: p.eposta }] : []),
    ...(p.telefon ? [{ etiket: "Telefon", deger: p.telefon }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-extrabold">Profil</h1>

      <section className="rounded-kart border border-cizgi bg-white p-4">
        <dl className="space-y-2">
          {satirlar.map((s) => (
            <div key={s.etiket} className="flex flex-wrap gap-x-3 text-sm">
              <dt className="w-36 shrink-0 font-semibold text-soluk">{s.etiket}</dt>
              <dd className="font-semibold">{s.deger}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-cizgi pt-3 text-sm text-soluk">
          Bilgilerinde hata varsa okul yönetimine başvur; bu bilgiler okulun yüklediği
          listelerden gelir.
        </p>
      </section>

      <section className="rounded-kart border border-cizgi bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Şifre Değiştir</h2>
        <SifreDegistirFormu />
      </section>
    </div>
  );
}
