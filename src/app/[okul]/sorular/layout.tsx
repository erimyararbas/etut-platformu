/**
 * Sorular, öğrenci ve öğretmenin ortak ekranı: rol kontrolü yok, kabuk
 * kullanıcının ana rolüne göre kuruluyor (bildirimler ve profil gibi).
 */

import { okulZorunlu } from "@/lib/okul";
import { oturumZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { anaRol, navigasyon, panelAdi, rolDuzeni, rolEtiketi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function SorularLayout({
  children,
  params,
}: LayoutProps<"/[okul]/sorular">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const oturum = await oturumZorunlu(slug);
  const rol = anaRol(oturum);

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen={rolDuzeni(rol)}
      panelAdi={panelAdi(rol)}
      rolEtiketi={rolEtiketi(rol)}
      nav={navigasyon(slug, rol)}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
