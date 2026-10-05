import Link from "next/link";
import { rolZorunlu } from "@/lib/auth/oturum";
import { yonetimOzeti } from "@/lib/yonetim/ozet";

export default async function YonetimAnaSayfa({ params }: PageProps<"/[okul]/yonetim">) {
  const { okul: slug } = await params;
  await rolZorunlu(slug, "admin");
  const o = await yonetimOzeti();

  const veriYok = o.ogrenciSayisi === 0 && o.ogretmenSayisi === 0;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Yönetim Paneli</h1>
        <p className="text-sm text-soluk">
          {veriYok
            ? "Sistemin çalışmaya başlaması için önce okul verisini yükleyin."
            : "Okulunuzun bu haftaki durumu."}
        </p>
      </div>

      {veriYok ? (
        <Kart
          slug={slug}
          yol="veri-aktarimi"
          baslik="Veri Aktarımı"
          aciklama="Excel şablonlarını yükleyin: sınıflar, dersler, konular, derslikler, etüt türleri, öğretmenler, öğrenciler ve veliler."
        />
      ) : (
        <>
          {/* Zamana duyarlı uyarılar önce: yoklama 24 saat sonra kilitleniyor. */}
          {o.yoklamasiEksik > 0 ? (
            <Uyari
              ton="olumsuz"
              baslik={`${o.yoklamasiEksik} etüdün yoklaması alınmamış`}
              aciklama="Yoklama, etüt bitiminden sonra ayarladığınız süre dolunca kilitlenir. Kilitlendikten sonra yalnızca siz düzeltebilirsiniz ve düzeltme denetim kaydına yazılır."
            />
          ) : null}
          {o.onayBekleyen > 0 ? (
            <Uyari
              ton="uyari"
              baslik={`${o.onayBekleyen} etüt onayınızı bekliyor`}
              aciklama="Onaylanana kadar öğrencilere görünmez."
              baglanti={{ yol: `/${slug}/yonetim/onaylar`, etiket: "Onaylara git" }}
            />
          ) : null}
          {o.girisYapmamis > 0 ? (
            <Uyari
              ton="notr"
              baslik={`${o.girisYapmamis} kişi henüz giriş yapmadı`}
              aciklama="Davet kodu üretildi ama şifre belirlenmedi. Kodları dağıttığınızdan emin olun."
              baglanti={{ yol: `/${slug}/yonetim/kullanicilar`, etiket: "Kullanıcılar" }}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Sayi etiket="Öğrenci" deger={o.ogrenciSayisi} />
            <Sayi etiket="Öğretmen" deger={o.ogretmenSayisi} />
            <Sayi etiket="Bu hafta etüt" deger={o.buHaftaEtut} />
            <Sayi etiket="Bu hafta kayıt" deger={o.buHaftaRezervasyon} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Kart
              slug={slug}
              yol="kullanicilar"
              baslik="Kullanıcılar"
              aciklama="Şifre sıfırlayın, hesap açıp kapatın."
            />
            <Kart
              slug={slug}
              yol="veri-aktarimi"
              baslik="Veri Aktarımı"
              aciklama="Excel şablonlarıyla veri ekleyin veya güncelleyin."
            />
            <Kart
              slug={slug}
              yol="ayarlar"
              baslik="Ayarlar"
              aciklama="Etüt onayı, rezervasyon penceresi, yoklama kilidi, bildirim kanalları."
            />
            <Kart
              slug={slug}
              yol="akademik"
              baslik="Akademik Yapı"
              aciklama="Sınıflar, dersler, konular, derslikler, etüt türleri."
            />
            <Kart
              slug={slug}
              yol="denetim"
              baslik="Denetim Kaydı"
              aciklama="Kim neyi ne zaman değiştirdi."
            />
          </div>
        </>
      )}
    </div>
  );
}

function Sayi({ etiket, deger }: { etiket: string; deger: number }) {
  return (
    <div className="rounded-kart border border-cizgi bg-white p-4">
      <div className="text-2xl font-extrabold tabular-nums">{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}

const TON_SINIFI = {
  olumsuz: "border-marka/30 bg-marka-acik text-marka-koyu",
  uyari: "border-uyari/30 bg-uyari-acik text-ink-2",
  notr: "border-cizgi bg-white text-ink-2",
} as const;

function Uyari({
  ton,
  baslik,
  aciklama,
  baglanti,
}: {
  ton: keyof typeof TON_SINIFI;
  baslik: string;
  aciklama: string;
  baglanti?: { yol: string; etiket: string };
}) {
  return (
    <div className={`rounded-kart border p-4 ${TON_SINIFI[ton]}`}>
      <div className="text-sm font-bold">{baslik}</div>
      <p className="mt-0.5 text-sm opacity-90">{aciklama}</p>
      {baglanti ? (
        <Link
          href={baglanti.yol}
          className="mt-2 inline-block rounded-lg border border-current/25 bg-white/70 px-3 py-1.5 text-sm font-semibold"
        >
          {baglanti.etiket}
        </Link>
      ) : null}
    </div>
  );
}

function Kart({
  slug,
  yol,
  baslik,
  aciklama,
}: {
  slug: string;
  yol: string;
  baslik: string;
  aciklama: string;
}) {
  return (
    <Link
      href={`/${slug}/yonetim/${yol}`}
      className="block rounded-kart border border-cizgi bg-white p-4 hover:border-mavi"
    >
      <h2 className="font-bold">{baslik}</h2>
      <p className="mt-1 text-sm text-soluk">{aciklama}</p>
    </Link>
  );
}
