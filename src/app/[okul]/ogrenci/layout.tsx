import { okulZorunlu } from "@/lib/okul";
import { rolZorunlu } from "@/lib/auth/oturum";
import { RolKabugu } from "@/components/app/rol-kabugu";
import { navigasyon } from "@/lib/navigasyon";
import { cikisYap } from "../giris/actions";

export default async function OgrenciLayout({
  children,
  params,
}: LayoutProps<"/[okul]/ogrenci">) {
  const { okul: slug } = await params;
  const okul = await okulZorunlu(slug);
  const oturum = await rolZorunlu(slug, "ogrenci");

  async function cikis() {
    "use server";
    await cikisYap(slug);
  }

  return (
    <RolKabugu
      okul={okul}
      oturum={oturum}
      duzen="ust"
      nav={navigasyon(slug, "ogrenci")}
      cikis={cikis}
    >
      {children}
    </RolKabugu>
  );
}
