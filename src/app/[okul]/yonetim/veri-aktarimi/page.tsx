import Link from "next/link";
import { templatesInOrder, type TemplateId } from "@/lib/import/templates";
import {
  VeriAktarimPaneli,
  type SablonBilgisi,
} from "@/components/app/veri-aktarim-paneli";
import {
  onizle,
  uygulaDosya,
  mevcutSayilar,
  type OnizlemeSonucu,
} from "./actions";

export default async function VeriAktarimiSayfasi({
  params,
  searchParams,
}: PageProps<"/[okul]/yonetim/veri-aktarimi">) {
  // Next 16'da ikisi de asenkron.
  const { okul: slug } = await params;
  const arama = await searchParams;

  const sablonlar = templatesInOrder();
  const sayilar = await mevcutSayilar();

  const istenen = typeof arama.sablon === "string" ? arama.sablon : undefined;
  const seciliId = (sablonlar.find((s) => s.id === istenen)?.id ??
    sablonlar[0].id) as TemplateId;

  const bilgiler: SablonBilgisi[] = sablonlar.map((s) => ({
    id: s.id,
    order: s.order,
    fileName: s.fileName,
    title: s.title,
    description: s.description,
    dependsOn: s.dependsOn,
    mevcutSayi: sayilar[s.id] ?? 0,
  }));

  async function onizleEylem(durum: OnizlemeSonucu | null, formData: FormData) {
    "use server";
    const sablon = formData.get("sablon") as TemplateId;
    return onizle(sablon, durum, formData);
  }

  async function uygulaEylem(durum: OnizlemeSonucu | null, formData: FormData) {
    "use server";
    const sablon = formData.get("sablon") as TemplateId;
    return uygulaDosya(sablon, slug, durum, formData);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">Veri Aktarımı</h1>
      <p className="mb-6 text-sm text-soluk">
        Şablonları <strong>sırayla</strong> yükleyin — sonraki dosyalar öncekilere referans verir.
        Yükleme hiçbir zaman kayıt silmez.
      </p>

      <ol className="mb-6 grid gap-2 sm:grid-cols-2">
        {bilgiler.map((s) => {
          const eksikOnKosul = s.dependsOn.filter(
            (d) => (sayilar[d] ?? 0) === 0,
          );
          const secili = s.id === seciliId;
          return (
            <li key={s.id}>
              <Link
                href={`/${slug}/yonetim/veri-aktarimi?sablon=${s.id}`}
                aria-current={secili ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  secili
                    ? "border-mavi bg-mavi-acik"
                    : "border-cizgi bg-white hover:border-mavi/50"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    s.mevcutSayi > 0
                      ? "bg-basarili-acik text-basarili"
                      : "bg-zemin text-soluk"
                  }`}
                >
                  {s.mevcutSayi > 0 ? "✓" : s.order}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.title}</span>
                  <span className="block text-xs text-soluk">
                    {s.mevcutSayi > 0 ? `${s.mevcutSayi} kayıt` : "henüz yüklenmedi"}
                    {eksikOnKosul.length > 0 && " · önce bağımlı dosyayı yükleyin"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {/*
        key = seciliId: şablon değişince bileşen sıfırdan kurulur.
        Olmazsa önceki dosyanın sonucu ("9 satır kaydedildi") yeni şablonun
        ekranında asılı kalır ve yöneticiyi yanıltır.
      */}
      <VeriAktarimPaneli
        key={seciliId}
        sablonlar={bilgiler}
        seciliId={seciliId}
        onizle={onizleEylem}
        uygulaDosya={uygulaEylem}
      />
    </div>
  );
}
