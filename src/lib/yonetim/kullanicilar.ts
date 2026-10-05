/**
 * Yönetici kullanıcı listesi.
 *
 * Yönetici kendi okulunun tüm kullanıcılarını görür (users_admin_okur, 0004).
 * Rol bilgisi ayrı tablodan geldiği için tek sorguda gömülü olarak çekilir.
 */

import "server-only";
import { supabaseSunucu } from "@/lib/supabase/server";
import type { KullaniciSatiri, RolSuzgeci } from "./kullanici-gorunum";

export type { KullaniciSatiri, RolSuzgeci } from "./kullanici-gorunum";
export { ROL_ADI, ROL_SUZGECLERI, suzgecUygula } from "./kullanici-gorunum";

interface OgrenciKaydi {
  okul_no: string;
  classes: { kod: string } | null;
}

interface Ham {
  id: string;
  ad: string;
  soyad: string;
  eposta: string | null;
  telefon: string | null;
  durum: string;
  sifre_belirlendi_mi: boolean;
  setup_token_expires_at: string | null;
  son_giris_at: string | null;
  user_roles: { role: string }[] | null;
  /**
   * `students.user_id` hem birincil anahtar hem yabancı anahtar olduğu için
   * PostgREST bunu BİRE-BİR ilişki sayar ve dizi değil NESNE döner. Şemayı
   * bilmeden dizi varsaymak, öğrencinin okul numarasını sessizce boş bırakır.
   */
  students: OgrenciKaydi | OgrenciKaydi[] | null;
}

function tekOgrenci(s: Ham["students"]): OgrenciKaydi | null {
  if (!s) return null;
  return Array.isArray(s) ? (s[0] ?? null) : s;
}

export async function kullanicilar(): Promise<KullaniciSatiri[]> {
  const supabase = await supabaseSunucu();
  const { data, error } = await supabase
    .from("users")
    .select(
      `id, ad, soyad, eposta, telefon, durum, sifre_belirlendi_mi,
       setup_token_expires_at, son_giris_at,
       user_roles(role),
       students!students_user_id_fkey(okul_no, classes(kod))`,
    )
    .order("soyad");

  if (error) throw new Error(`Kullanıcılar okunamadı: ${error.message}`);

  return ((data ?? []) as unknown as Ham[]).map((u) => {
    const ogrenci = tekOgrenci(u.students);
    return {
      id: u.id,
      ad: u.ad,
      soyad: u.soyad,
      eposta: u.eposta,
      telefon: u.telefon,
      okulNo: ogrenci?.okul_no ?? null,
      sinif: ogrenci?.classes?.kod ?? null,
      durum: u.durum as KullaniciSatiri["durum"],
      roller: (u.user_roles ?? []).map((r) => r.role),
      sifreBelirlendiMi: u.sifre_belirlendi_mi,
      davetSonKullanma: u.setup_token_expires_at,
      sonGiris: u.son_giris_at,
    };
  });
}

export function suzgecSayilari(liste: KullaniciSatiri[]): Record<RolSuzgeci, number> {
  return {
    hepsi: liste.length,
    ogrenci: liste.filter((k) => k.roller.includes("ogrenci")).length,
    ogretmen: liste.filter((k) => k.roller.some((r) => r === "ogretmen" || r === "mentor")).length,
    veli: liste.filter((k) => k.roller.includes("veli")).length,
    admin: liste.filter((k) => k.roller.includes("admin")).length,
    girmemis: liste.filter((k) => !k.sifreBelirlendiMi).length,
  };
}
