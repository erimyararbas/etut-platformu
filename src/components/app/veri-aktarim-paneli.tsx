"use client";

import { useActionState, startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OnizlemeSonucu } from "@/app/[okul]/yonetim/veri-aktarimi/actions";
import type { TemplateId } from "@/lib/import/templates";

export interface SablonBilgisi {
  id: TemplateId;
  order: number;
  fileName: string;
  title: string;
  description: string;
  dependsOn: TemplateId[];
  mevcutSayi: number;
}

interface Props {
  sablonlar: SablonBilgisi[];
  onizle: (durum: OnizlemeSonucu | null, formData: FormData) => Promise<OnizlemeSonucu>;
  uygulaDosya: (durum: OnizlemeSonucu | null, formData: FormData) => Promise<OnizlemeSonucu>;
  seciliId: TemplateId;
}

export function VeriAktarimPaneli({ sablonlar, onizle, uygulaDosya, seciliId }: Props) {
  const [onizlemeDurumu, onizleEylem, onizleniyor] = useActionState(onizle, null);
  const [uygulamaDurumu, uygulaEylem, uygulaniyor] = useActionState(uygulaDosya, null);

  /**
   * DİKKAT — dosya DOM'da değil, burada tutuluyor.
   *
   * React 19 bir form action'ı tamamlandığında formu sıfırlar; <input type=file>
   * kontrol edilebilir bir alan olmadığı için seçim uçar. Önizlemeden sonra
   * "Onayla" düğmesi boş bir forma basmış olur ve hiç gönderim yapmaz.
   * Dosyayı state'te tutup FormData'yı elle kurmak bu davranıştan bağımsız kılar.
   */
  const [dosya, setDosya] = useState<File | null>(null);

  const secili = sablonlar.find((s) => s.id === seciliId)!;
  const sonuc = uygulamaDurumu ?? onizlemeDurumu;
  const uygulanabilir =
    sonuc?.durum === "onizleme" && sonuc.dosyaHatalari.length === 0 && sonuc.ozet.toplam > 0;

  const gonder = (eylem: (fd: FormData) => void) => () => {
    if (!dosya) return;
    const fd = new FormData();
    fd.set("sablon", seciliId);
    fd.set("dosya", dosya);
    startTransition(() => eylem(fd));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-kart border border-cizgi bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-lacivert-acik px-2 py-0.5 text-xs font-bold text-lacivert">
            {secili.order}
          </span>
          <h2 className="text-base font-bold">{secili.title}</h2>
          <code className="ml-auto text-xs text-soluk">{secili.fileName}</code>
        </div>
        <p className="mb-4 text-sm text-soluk">{secili.description}</p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
            className="block w-full max-w-sm cursor-pointer rounded-md border border-cizgi text-sm
                       file:mr-3 file:cursor-pointer file:border-0 file:bg-zemin file:px-4 file:py-2
                       file:text-sm file:font-semibold file:text-lacivert"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!dosya || onizleniyor}
            onClick={gonder(onizleEylem)}
          >
            {onizleniyor ? "Kontrol ediliyor…" : "Kontrol Et"}
          </Button>
          {uygulanabilir && (
            <Button type="button" disabled={uygulaniyor} onClick={gonder(uygulaEylem)}>
              {uygulaniyor ? "Kaydediliyor…" : "Onayla ve Kaydet"}
            </Button>
          )}
        </div>

        {dosya && !sonuc && (
          <p className="mt-3 text-sm text-soluk">
            Seçildi: <strong>{dosya.name}</strong> — kaydetmeden önce <em>Kontrol Et</em>&apos;e basın.
          </p>
        )}
      </div>

      {sonuc && <Sonuc sonuc={sonuc} />}
    </div>
  );
}

function Sonuc({ sonuc }: { sonuc: OnizlemeSonucu }) {
  if (sonuc.dosyaHatalari.length) {
    return (
      <div className="rounded-kart border border-marka/30 bg-marka-acik p-5">
        <h3 className="mb-2 font-bold text-marka-koyu">Dosya kabul edilmedi</h3>
        <ul className="space-y-1 text-sm text-marka-koyu">
          {sonuc.dosyaHatalari.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-marka-koyu/80">Hiçbir kayıt değiştirilmedi.</p>
      </div>
    );
  }

  const uygulandi = sonuc.durum === "uygulandi";

  return (
    <div className="space-y-4">
      <div
        className={`rounded-kart border p-5 ${
          uygulandi ? "border-basarili/30 bg-basarili-acik" : "border-cizgi bg-white"
        }`}
      >
        <h3 className="mb-3 font-bold">
          {uygulandi ? "Kaydedildi" : "Önizleme — henüz hiçbir şey kaydedilmedi"}
        </h3>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kutu etiket="Toplam satır" deger={sonuc.ozet.toplam} />
          <Kutu
            etiket={uygulandi ? "Eklendi" : "Eklenecek"}
            deger={sonuc.ozet.ekle}
            renk="text-basarili"
          />
          <Kutu
            etiket={uygulandi ? "Güncellendi" : "Güncellenecek"}
            deger={sonuc.ozet.guncelle}
            renk="text-mavi"
          />
          <Kutu
            etiket="Hatalı satır"
            deger={sonuc.ozet.hata}
            renk={sonuc.ozet.hata ? "text-marka" : "text-soluk"}
          />
        </div>

        {!uygulandi && sonuc.ozet.hata > 0 && (
          <p className="mt-4 text-sm text-ink-2">
            Hatalı satırlar <strong>kaydedilmeyecek</strong>; diğerleri uygulanacak. İsterseniz
            düzeltip dosyayı tekrar yükleyebilirsiniz.
          </p>
        )}

        {uygulandi && (
          <p className="mt-4 text-sm text-ink-2">
            Dosyada olmayan kayıtlara dokunulmadı — içe aktarım hiçbir zaman silmez.
          </p>
        )}
      </div>

      {sonuc.dosyaUyarilari.length > 0 && (
        <div className="rounded-kart border border-uyari/30 bg-uyari-acik p-4">
          <h4 className="mb-1 text-sm font-bold text-ink">Uyarılar</h4>
          <ul className="space-y-1 text-sm text-ink-2">
            {sonuc.dosyaUyarilari.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      {sonuc.hataliSatirlar.length > 0 && (
        <div className="overflow-hidden rounded-kart border border-cizgi bg-white">
          <h4 className="border-b border-cizgi px-5 py-3 text-sm font-bold">
            Düzeltilmesi gereken satırlar
          </h4>
          <ul className="divide-y divide-cizgi">
            {sonuc.hataliSatirlar.map((s) => (
              <li key={s.satirNo} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded bg-marka-acik px-2 py-0.5 font-mono text-xs font-bold text-marka-koyu">
                    Satır {s.satirNo}
                  </span>
                  <span className="font-semibold">{s.ozet}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-soluk">
                  {s.hatalar.map((h, i) => (
                    <li key={i}>• {h.mesaj}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {sonuc.gizlenenHata > 0 && (
            <p className="border-t border-cizgi px-5 py-3 text-sm text-soluk">
              …ve {sonuc.gizlenenHata} hatalı satır daha.
            </p>
          )}
        </div>
      )}

      {sonuc.davetKodlari && sonuc.davetKodlari.length > 0 && (
        <DavetKodlari kodlar={sonuc.davetKodlari} />
      )}

      {!uygulandi && sonuc.ornekSatirlar.length > 0 && (
        <div className="overflow-hidden rounded-kart border border-cizgi bg-white">
          <h4 className="border-b border-cizgi px-5 py-3 text-sm font-bold">
            Okunan veriden örnek
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zemin text-left">
                  <th className="px-3 py-2 font-semibold text-soluk">Satır</th>
                  {sonuc.basliklar.map((b) => (
                    <th key={b} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {sonuc.ornekSatirlar.map((s) => (
                  <tr key={s.satirNo}>
                    <td className="px-3 py-2 text-soluk">{s.satirNo}</td>
                    {s.degerler.map((d, i) => (
                      <td key={i} className="whitespace-nowrap px-3 py-2">
                        {d || <span className="text-soluk">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Kutu({ etiket, deger, renk = "" }: { etiket: string; deger: number; renk?: string }) {
  return (
    <div className="rounded-lg border border-cizgi bg-white px-3 py-2">
      <div className={`text-xl font-extrabold ${renk}`}>{deger}</div>
      <div className="text-xs text-soluk">{etiket}</div>
    </div>
  );
}

function DavetKodlari({ kodlar }: { kodlar: { ad: string; soyad: string; kimlik: string; rol: string; kod: string }[] }) {
  const indir = () => {
    // Kodlar bir kez gösterilir; yönetici bunu dağıtacağı için CSV olarak iner.
    const satirlar = [
      ["Ad", "Soyad", "Rol", "Giriş Kimliği", "Davet Kodu"],
      ...kodlar.map((k) => [k.ad, k.soyad, k.rol, k.kimlik, k.kod]),
    ];
    // Excel'in Türkçe karakterleri doğru okuması için BOM ve noktalı virgül.
    const csv = "﻿" + satirlar.map((s) => s.map((h) => `"${h}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "davet-kodlari.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-kart border border-mavi/30 bg-mavi-acik">
      <div className="flex flex-wrap items-center gap-3 border-b border-mavi/20 px-5 py-3">
        <h4 className="text-sm font-bold text-mavi-koyu">
          {kodlar.length} kişi için giriş kodu üretildi
        </h4>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={indir}>
          Listeyi indir (CSV)
        </Button>
      </div>
      <p className="px-5 py-3 text-sm text-ink-2">
        Bu kodlar <strong>yalnızca şimdi</strong> görünür — veritabanında kodun kendisi değil,
        şifrelenmiş özeti saklanır. Listeyi indirip dağıtın. Kaybolursa dosyayı tekrar yükleyerek
        yeni kod üretebilirsiniz.
      </p>
      <div className="max-h-64 overflow-auto border-t border-mavi/20 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zemin text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Ad Soyad</th>
              <th className="px-3 py-2 font-semibold">Giriş Kimliği</th>
              <th className="px-3 py-2 font-semibold">Kod</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {kodlar.map((k) => (
              <tr key={k.kimlik}>
                <td className="px-3 py-2">
                  {k.ad} {k.soyad}
                </td>
                <td className="px-3 py-2 text-soluk">{k.kimlik}</td>
                <td className="px-3 py-2 font-mono font-bold tracking-widest">{k.kod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
