import Link from "next/link";
import { redirect } from "next/navigation";
import { okulZorunlu } from "@/lib/okul";
import { oturum } from "@/lib/auth/oturum";
import { rolAnaSayfasi } from "@/lib/auth/kimlik";
import { GirisFormu } from "@/components/app/giris-formu";
import { DemoGiris } from "@/components/app/demo-giris";
import { girisYap, type ActionDurumu } from "./actions";
import { demoAcikMi, demoGiris } from "./demo-actions";

export default async function GirisSayfasi({ params }: PageProps<"/[okul]/giris">) {
  // Next 16'da params asenkron.
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);

  // Zaten giriş yapmışsa giriş ekranını tekrar göstermenin anlamı yok.
  const mevcut = await oturum();
  if (mevcut && mevcut.okulSlug === slug && mevcut.sifreBelirlendiMi) {
    redirect(rolAnaSayfasi(slug, mevcut.roller));
  }

  // Demo seçeneği yalnızca okulun ayarı açıksa görünür (0031); varsayılan
  // kapalı olduğu için gerçek bir okulun giriş ekranına kendiliğinden çıkmaz.
  const demoVar = await demoAcikMi(slug);

  async function eylem(durum: ActionDurumu, formData: FormData) {
    "use server";
    return girisYap(slug, durum, formData);
  }

  async function demoEylemi(durum: ActionDurumu, formData: FormData) {
    "use server";
    return demoGiris(slug, durum, formData);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-cizgi bg-white">
            {okul.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={okul.logoUrl} alt="" className="size-10 object-contain" />
            ) : (
              <span className="text-xl font-extrabold text-marka">
                {okul.ad.slice(0, 1)}
              </span>
            )}
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-lacivert">{okul.ad}</h1>
          <p className="mt-1 text-sm text-soluk">Etüt Platformu</p>
        </div>

        <div className="rounded-kart border border-cizgi bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-bold">Giriş Yap</h2>
          <p className="mb-5 text-sm text-soluk">
            Hesabınıza ilk kez giriyorsanız{" "}
            <Link href={`/${slug}/ilk-giris`} className="font-semibold text-mavi underline">
              davet kodunuzla şifrenizi belirleyin
            </Link>
            .
          </p>
          <GirisFormu eylem={eylem} />
          {demoVar ? <DemoGiris eylem={demoEylemi} /> : null}
        </div>

        <p className="mt-6 text-center text-xs text-soluk">
          Şifrenizi unuttuysanız okul yönetimine başvurun.
        </p>
      </div>
    </main>
  );
}
