/**
 * Profil de bildirimler gibi her rolün ortak ekranı: rol kontrolü yok,
 * yalnızca giriş aranır ve kabuk kullanıcının ana rolüne göre kurulur.
 */

import { okulZorunlu } from "@/lib/okul";
import { oturumZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { anaRol, navigasyon, panelAdi, rolDuzeni, rolEtiketi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function ProfilLayout({
  children,
  params,
}: LayoutProps<"/[okul]/profil">) {
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
