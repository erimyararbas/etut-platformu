/**
 * Her rolün paylaştığı uygulama kabuğu: başlık, gezinme ve bildirim zili.
 *
 * Dört rol layout'u başlığı ve çıkış formunu kopyalıyordu. Bildirim zilinin her
 * ekranda görünmesi gerektiği için kopya sayısı artacaktı; kabuk burada
 * toplandı.
 *
 * İki düzen var ve ikisi de korunuyor:
 *   - "kenar": personel (yönetici, öğretmen) — geniş ekranda sol menü
 *   - "ust":   öğrenci ve veli — telefonda kullanıldığı için üst bar
 * Düzeni birleştirmek prototipin doğruladığı iki ayrı kullanım biçimini
 * bozardı; ortaklaşan şey kabuk, görünüm değil.
 *
 * Sunucu bileşeni: okunmamış sayısı her gezinmede sunucuda tazelenir.
 */

import Link from "next/link";
import { okunmamisSayisi } from "@/lib/bildirim/sorgular";
import { rozetMetni } from "@/lib/bildirim/gorunum";
import type { Okul } from "@/lib/okul";
import type { Oturum } from "@/lib/auth/oturum";

export interface NavOgesi {
  etiket: string;
  yol: string;
  /** Dar ekrandaki kısa etiket; verilmezse `etiket` kullanılır. */
  kisa?: string;
}

interface Props {
  okul: Okul;
  oturum: Oturum;
  duzen: "kenar" | "ust";
  /** Kenar düzeninde logonun altındaki alt başlık ("Yönetim Paneli"). */
  panelAdi?: string;
  /** Üst düzende adın yanındaki rol adı ("Veli"). */
  rolEtiketi?: string;
  nav: NavOgesi[];
  /** Layout'tan gelen "use server" çıkış fonksiyonu. */
  cikis: () => Promise<void>;
  children: React.ReactNode;
}

export async function RolKabugu(props: Props) {
  const okunmamis = await okunmamisSayisi();
  const rozet = rozetMetni(okunmamis);
  return props.duzen === "kenar" ? (
    <KenarDuzeni {...props} rozet={rozet} okunmamis={okunmamis} />
  ) : (
    <UstDuzeni {...props} rozet={rozet} okunmamis={okunmamis} />
  );
}

type IcProps = Props & { rozet: string; okunmamis: number };

function OkulRozeti({ okul }: { okul: Okul }) {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-cizgi">
      <span className="text-sm font-extrabold text-marka">{okul.ad.slice(0, 1)}</span>
    </div>
  );
}

function CikisDugmesi({ cikis }: { cikis: () => Promise<void> }) {
  return (
    <form action={cikis}>
      <button
        type="submit"
        className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
      >
        Çıkış
      </button>
    </form>
  );
}

function ZilBaglantisi({
  okulSlug,
  rozet,
  okunmamis,
}: {
  okulSlug: string;
  rozet: string;
  okunmamis: number;
}) {
  return (
    <Link
      href={`/${okulSlug}/bildirimler`}
      aria-label={okunmamis > 0 ? `Bildirimler — ${okunmamis} okunmamış` : "Bildirimler"}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-cizgi hover:bg-zemin"
    >
      <ZilSimgesi />
      {rozet ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-marka px-1 text-center text-[10px] font-bold leading-[18px] text-white">
          {rozet}
        </span>
      ) : null}
    </Link>
  );
}

/** Personel düzeni: geniş ekranda sol menü, dar ekranda yatay kaydırılan menü. */
function KenarDuzeni({
  okul,
  oturum,
  panelAdi,
  nav,
  cikis,
  children,
  rozet,
  okunmamis,
}: IcProps) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-cizgi bg-white md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-5 py-4">
          <OkulRozeti okul={okul} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">{okul.ad}</div>
            <div className="text-xs text-soluk">{panelAdi}</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {nav.map((o) => (
            <Link
              key={o.yol}
              href={o.yol}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-zemin"
            >
              {o.etiket}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-cizgi bg-white px-5 py-3">
          <div className="ml-auto flex items-center gap-3">
            {/* Ad, profilin girişidir — ayrı bir menü öğesi eklemeye gerek yok. */}
            <Link
              href={`/${okul.slug}/profil`}
              className="hidden rounded-lg px-2 py-1 text-sm text-soluk hover:bg-zemin hover:text-ink sm:inline"
            >
              {oturum.ad} {oturum.soyad}
            </Link>
            <ZilBaglantisi okulSlug={okul.slug} rozet={rozet} okunmamis={okunmamis} />
            <CikisDugmesi cikis={cikis} />
          </div>
        </header>
        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}

/** Öğrenci ve veli düzeni: telefon önce — üst bar, altta gezinme. */
function UstDuzeni({
  okul,
  oturum,
  rolEtiketi,
  nav,
  cikis,
  children,
  rozet,
  okunmamis,
}: IcProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cizgi bg-white px-4 py-3">
        <OkulRozeti okul={okul} />
        <Link href={`/${okul.slug}/profil`} className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight">{okul.ad}</div>
          <div className="truncate text-xs text-soluk">
            {oturum.ad} {oturum.soyad}
            {rolEtiketi ? ` · ${rolEtiketi}` : ""}
          </div>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {nav.map((o) => (
            <Link
              key={o.yol}
              href={o.yol}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-soluk hover:bg-zemin hover:text-ink"
            >
              {o.etiket}
            </Link>
          ))}
        </nav>

        <ZilBaglantisi okulSlug={okul.slug} rozet={rozet} okunmamis={okunmamis} />
        <CikisDugmesi cikis={cikis} />
      </header>

      <main className="flex-1 p-4 pb-24 sm:p-5 sm:pb-5">{children}</main>

      {/* Dar ekranda alt gezinme; geniş ekranda başlıktaki menü yeterli. */}
      <nav className="alt-nav-payi fixed inset-x-0 bottom-0 z-20 flex border-t border-cizgi bg-white pt-1 sm:hidden">
        {nav.map((o) => (
          <Link
            key={o.yol}
            href={o.yol}
            className="flex-1 px-1 py-2 text-center text-xs font-semibold text-soluk"
          >
            {o.kisa ?? o.etiket}
          </Link>
        ))}
        <Link
          href={`/${okul.slug}/bildirimler`}
          className="flex-1 px-1 py-2 text-center text-xs font-semibold text-soluk"
        >
          Bildirim
          {rozet ? (
            <span className="ml-1 rounded-full bg-marka px-1.5 text-[10px] font-bold text-white">
              {rozet}
            </span>
          ) : null}
        </Link>
      </nav>
    </div>
  );
}

function ZilSimgesi() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px] text-lacivert"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
