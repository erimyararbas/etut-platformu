import { okulZorunlu } from "@/lib/okul";
import { rolZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { navigasyon, panelAdi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function YonetimLayout({ children, params }: LayoutProps<"/[okul]/yonetim">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  // Yetki kontrolü burada; proxy.ts yalnızca oturum tazeler.
  const oturum = await rolZorunlu(slug, "admin");

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen="kenar"
      panelAdi={panelAdi("admin")}
      nav={navigasyon(slug, "admin")}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
