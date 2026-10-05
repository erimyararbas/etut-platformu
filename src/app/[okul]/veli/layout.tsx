import { okulZorunlu } from "@/lib/okul";
import { rolZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { navigasyon, rolEtiketi } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function VeliLayout({ children, params }: LayoutProps<"/[okul]/veli">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const oturum = await rolZorunlu(slug, "veli");

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen="ust"
      rolEtiketi={rolEtiketi("veli")}
      nav={navigasyon(slug, "veli")}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
