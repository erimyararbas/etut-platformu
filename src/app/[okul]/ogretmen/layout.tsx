import { okulZorunlu } from "@/lib/okul";
import { rolZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { navigasyon, panelAdi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function OgretmenLayout({
  children,
  params,
}: LayoutProps<"/[okul]/ogretmen">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const oturum = await rolZorunlu(slug, "ogretmen");

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen="kenar"
      panelAdi={panelAdi("ogretmen")}
      nav={navigasyon(slug, "ogretmen")}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
