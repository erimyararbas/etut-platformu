/**
 * Rehberlik paneli. Rol kontrolü burada: yalnızca `rehber`.
 * Yönetici bu adrese giderse kendi paneline döner (0023'teki ayrımın
 * arayüzdeki karşılığı).
 */

import { okulZorunlu } from "@/lib/okul";
import { rolZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { navigasyon, panelAdi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function RehberlikLayout({
  children,
  params,
}: LayoutProps<"/[okul]/rehberlik">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const oturum = await rolZorunlu(slug, "rehber");

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen="kenar"
      panelAdi={panelAdi("rehber")}
      nav={navigasyon(slug, "rehber", oturum.roller)}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
