/**
 * Okul kök sayfası — kullanıcıyı kendi paneline gönderen kavşak.
 *
 * NEDEN VAR: `oturumZorunlu` ve `rolZorunlu` yetkisiz erişimde `/{okul}`
 * adresine yönlendiriyor. Bu sayfa olmadığı sürece o yönlendirmelerin hepsi
 * 404'e düşüyordu — yani yanlış panele giren bir kullanıcı "sayfa bulunamadı"
 * görüyordu. Yetki reddinin karşılığı çıkmaz sokak değil, kendi paneli olmalı.
 *
 * Giriş yapmamış ziyaretçi giriş sayfasına gider.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { okulZorunlu } from "@/lib/okul";
import { oturum } from "@/lib/auth/oturum";
import { anaRol, rolAnaYolu } from "@/lib/navigasyon";

export default async function OkulKokSayfasi({ params }: PageProps<"/[okul]">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const o = await oturum();

  if (!o) redirect(`/${slug}/giris`);

  // Başka okulun adresine gelmiş: kendi okuluna.
  if (o.okulSlug !== slug) redirect(`/${o.okulSlug}`);
  if (!o.sifreBelirlendiMi) redirect(`/${slug}/ilk-giris`);

  const rol = anaRol(o);
  const hedef = rolAnaYolu(slug, rol);

  // Rolü tanınmayan kullanıcı buraya geri yönlendirilseydi sonsuz döngü olurdu;
  // onun yerine ne yapması gerektiği söyleniyor.
  if (rol && hedef !== `/${slug}`) redirect(hedef);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-kart border border-cizgi bg-white p-6 text-center">
        <h1 className="font-bold">{okul.ad}</h1>
        <p className="mt-2 text-sm text-soluk">
          Hesabınıza henüz bir rol tanımlanmamış. Okul yönetimine başvurun.
        </p>
        <Link
          href={`/${slug}/giris`}
          className="mt-4 inline-block rounded-lg border border-cizgi px-4 py-2 text-sm font-semibold hover:bg-zemin"
        >
          Giriş sayfası
        </Link>
      </div>
    </div>
  );
}
