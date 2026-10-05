import Link from "next/link";
import { okulZorunlu } from "@/lib/okul";
import { IlkGirisFormu } from "@/components/app/ilk-giris-formu";
import { sifreBelirle, type ActionDurumu } from "../giris/actions";

export default async function IlkGirisSayfasi({ params }: PageProps<"/[okul]/ilk-giris">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);

  async function eylem(durum: ActionDurumu, formData: FormData) {
    "use server";
    return sifreBelirle(slug, durum, formData);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-lacivert">{okul.ad}</h1>
          <p className="mt-1 text-sm text-soluk">Etüt Platformu</p>
        </div>

        <div className="rounded-kart border border-cizgi bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-bold">İlk Giriş</h2>
          <p className="mb-5 text-sm text-soluk">
            Size verilen davet koduyla kendi şifrenizi belirleyin. Kod tek kullanımlıktır.
          </p>
          <IlkGirisFormu eylem={eylem} />
        </div>

        <p className="mt-6 text-center text-xs text-soluk">
          Şifrenizi daha önce belirlediyseniz{" "}
          <Link href={`/${slug}/giris`} className="font-semibold text-mavi underline">
            giriş sayfasına
          </Link>{" "}
          dönün.
        </p>
      </div>
    </main>
  );
}
