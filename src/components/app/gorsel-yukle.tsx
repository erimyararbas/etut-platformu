"use client";

/**
 * Fotoğraf yükleme — tarayıcıdan DOĞRUDAN Supabase Storage'a.
 *
 * Dosya sunucumuzdan geçmiyor. İki sebebi var: Vercel'in istek gövdesi sınırı
 * 8 MB'lık bir fotoğrafı reddederdi, ve geçseydi bile aynı dosya ağdan iki kez
 * geçerdi (tarayıcı → sunucu → Storage). Yükleme kullanıcının kendi oturumuyla
 * yapıldığı için Storage politikası (0020) yine devrede: öğrenci yalnızca
 * kendi klasörüne yazabiliyor.
 *
 * Form'a yüklenen dosyanın YOLU gidiyor, dosyanın kendisi değil.
 */

import { useRef, useState } from "react";
import { supabaseTarayici } from "@/lib/supabase/browser";
import { KOVA, dosyayiDogrula, gorselYolu } from "@/lib/calisma/gorsel";

interface Props {
  schoolId: string;
  /** Dosyanın altına yazılacağı öğrenci — öğretmen yanıtında da öğrencinin klasörü. */
  ogrenciId: string;
  /** Yükleme bitince yol; kaldırılınca null. */
  degisti: (yol: string | null) => void;
}

export function GorselYukle({ schoolId, ogrenciId, degisti }: Props) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const girdiRef = useRef<HTMLInputElement>(null);

  async function sec(dosya: File) {
    setHata(null);

    const sorun = dosyayiDogrula(dosya);
    if (sorun) {
      setHata(sorun.hata);
      return;
    }

    setYukleniyor(true);
    try {
      const yol = gorselYolu(schoolId, ogrenciId, dosya.name);
      const { error } = await supabaseTarayici()
        .storage.from(KOVA)
        .upload(yol, dosya, { contentType: dosya.type, upsert: false });

      if (error) {
        // Politika reddi de buraya düşer; kullanıcıya teknik mesaj gösterilmez.
        setHata("Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.");
        return;
      }

      // Önizleme yerel dosyadan: imzalı bağlantı istemek için sunucuya gitmeye
      // gerek yok, dosya zaten elimizde.
      setOnizleme(URL.createObjectURL(dosya));
      degisti(yol);
    } finally {
      setYukleniyor(false);
    }
  }

  function kaldir() {
    // Storage'daki dosya bilerek SİLİNMİYOR: kullanıcı vazgeçip yeniden
    // yükleyebilir ve yetim bir dosya, yanlışlıkla silinmiş bir soru
    // görselinden iyidir. Temizlik ayrı bir işin konusu.
    if (onizleme) URL.revokeObjectURL(onizleme);
    setOnizleme(null);
    degisti(null);
    if (girdiRef.current) girdiRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {onizleme ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: adresi,
              next/image optimizasyonu uygulanamaz */}
          <img
            src={onizleme}
            alt="Yüklenen fotoğraf"
            className="max-h-40 rounded-lg border border-cizgi"
          />
          <button
            type="button"
            onClick={kaldir}
            className="rounded-lg border border-cizgi px-3 py-1.5 text-sm font-semibold hover:bg-zemin"
          >
            Kaldır
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-cizgi px-3 py-2 text-sm font-semibold text-mavi hover:bg-zemin">
          <input
            ref={girdiRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const d = e.target.files?.[0];
              if (d) void sec(d);
            }}
          />
          {yukleniyor ? "Yükleniyor…" : "📷 Fotoğraf ekle"}
        </label>
      )}

      {hata ? <p className="text-sm font-semibold text-marka">{hata}</p> : null}
    </div>
  );
}
