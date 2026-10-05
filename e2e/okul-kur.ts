/**
 * Uçtan uca test için tek kullanımlık okul.
 *
 * NEDEN HER KOŞUDA YENİ OKUL: testler gerçek Supabase projesine bağlanıyor.
 * Paylaşılan "ornek-okul" üzerinde çalışsalardı her koşu kalıcı çöp bırakır,
 * ikinci koşu birincinin verisine takılırdı. Benzersiz slug + sonunda silme
 * ile testler birbirinden ve geliştirme verisinden tamamen yalıtık.
 *
 * Kullanıcılar davet kodu akışından geçirilmiyor, şifreleri doğrudan
 * belirleniyor: ilk giriş akışının kendi birim testleri var, burada asıl
 * doğrulanmak istenen etüt akışı.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sentetikEposta } from "../src/lib/auth/kimlik";

export const SIFRE = "E2eParola!2026";

export interface TestOkulu {
  slug: string;
  schoolId: string;
  adminEposta: string;
  ogretmenEposta: string;
  ogrenci1No: string;
  ogrenci2No: string;
  veliTelefon: string;
  kullaniciIdleri: string[];
}

function servis(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anahtar) {
    throw new Error(
      "E2E için NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).",
    );
  }
  return createClient(url, anahtar, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Okulun saat dilimindeki bugünden n gün sonrası. */
export function gunSonra(n: number): string {
  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const d = new Date(
    Date.UTC(
      Number(bugun.slice(0, 4)),
      Number(bugun.slice(5, 7)) - 1,
      Number(bugun.slice(8, 10)) + n,
    ),
  );
  const iki = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}`;
}

/**
 * Önceki koşulardan kalan test okullarını siler.
 *
 * Bir test çöktüğünde `afterAll` çalışmayabiliyor ve okul veritabanında
 * kalıyor. Yalnızca "e2e-" ile başlayan sluglar siliniyor; bu öneki testten
 * başkası üretmez, dolayısıyla gerçek okul verisine dokunma ihtimali yok.
 */
async function eskileriSupur(db: SupabaseClient): Promise<void> {
  const birSaatOnce = new Date(Date.now() - 3_600_000).toISOString();
  const { data } = await db
    .from("schools")
    .select("id")
    .like("slug", "e2e-%")
    .lt("created_at", birSaatOnce);

  for (const okul of data ?? []) {
    const { data: kullanicilar } = await db.from("users").select("id").eq("school_id", okul.id);
    for (const k of kullanicilar ?? []) await db.auth.admin.deleteUser(k.id);
    await db.from("schools").delete().eq("id", okul.id);
  }
}

export async function okulKur(): Promise<TestOkulu> {
  const db = servis();
  await eskileriSupur(db);
  const damga = Date.now().toString(36);
  const slug = `e2e-${damga}`;
  const kullaniciIdleri: string[] = [];

  const tek = async <T>(tablo: string, satir: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.from(tablo).insert(satir).select().single();
    if (error) throw new Error(`${tablo} eklenemedi: ${error.message}`);
    return data as T;
  };

  const okul = await tek<{ id: string }>("schools", { slug, ad: `E2E Okulu ${damga}` });

  await tek("school_settings", {
    school_id: okul.id,
    // Onay akışı ayrı test edilecek; burada öğretmenin etüdü onaya düşsün.
    etut_onay_gerekli: true,
    // Rezervasyon penceresi testin saatine bağlı kalmasın diye sonuna kadar açık.
    gelecek_hafta_acilis_gun: 1,
    gelecek_hafta_acilis_saat: "00:00",
  });

  const seviye = await tek<{ id: string }>("grade_levels", {
    school_id: okul.id,
    ad: "11. Sınıf",
    sira: 3,
  });
  const sinif = await tek<{ id: string }>("classes", {
    school_id: okul.id,
    kod: "11-A",
    grade_level_id: seviye.id,
    sube: "A",
  });
  const ders = await tek<{ id: string }>("subjects", { school_id: okul.id, ad: "Matematik" });
  await tek("topics", {
    school_id: okul.id,
    subject_id: ders.id,
    grade_level_id: seviye.id,
    ad: "Türev",
    sira: 1,
  });
  await tek("rooms", { school_id: okul.id, kod: "E-101", kapasite: 20 });
  await tek("etut_types", { school_id: okul.id, ad: "Soru Çözümü" });

  const kullaniciYap = async (
    eposta: string,
    ad: string,
    soyad: string,
    roller: string[],
    telefon?: string,
  ) => {
    const { data, error } = await db.auth.admin.createUser({
      email: eposta,
      password: SIFRE,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Auth kullanıcısı: ${error?.message}`);
    const id = data.user.id;
    kullaniciIdleri.push(id);

    const { error: uHata } = await db.from("users").insert({
      id,
      school_id: okul.id,
      ad,
      soyad,
      // Öğrenci ve velinin sentetik e-postası users.eposta'ya yazılmaz;
      // giriş kimliği okul numarası / telefondur.
      eposta: roller.includes("ogretmen") || roller.includes("admin") ? eposta : null,
      telefon: telefon ?? null,
      sifre_belirlendi_mi: true,
    });
    if (uHata) throw new Error(`users: ${uHata.message}`);

    for (const r of roller) {
      const { error: rHata } = await db
        .from("user_roles")
        .insert({ user_id: id, school_id: okul.id, role: r });
      if (rHata) throw new Error(`user_roles: ${rHata.message}`);
    }
    return id;
  };

  const adminEposta = `admin@${slug}.test`;
  await kullaniciYap(adminEposta, "Ayşe", "Yönetici", ["admin"]);

  const ogretmenEposta = `ogretmen@${slug}.test`;
  const ogretmenId = await kullaniciYap(ogretmenEposta, "Ahmet", "Öğretmen", ["ogretmen"]);
  await tek("teachers", {
    user_id: ogretmenId,
    school_id: okul.id,
    brans_subject_id: ders.id,
  });

  // Öğrenci girişi okul numarasıyla; auth e-postası sentetik.
  const ogrenci1No = "901";
  const ogrenci2No = "902";
  const ogrenciYap = async (no: string, ad: string) => {
    // Auth e-postası uygulamayla AYNI kuraldan üretilmeli; elle yazılan bir
    // biçim testin girişini sessizce bozar (bkz. lib/auth/kimlik.ts).
    const id = await kullaniciYap(sentetikEposta(slug, "ogrenci", no), ad, "Öğrenci", [
      "ogrenci",
    ]);
    await tek("students", {
      user_id: id,
      school_id: okul.id,
      okul_no: no,
      class_id: sinif.id,
    });
    return id;
  };
  const ogrenci1Id = await ogrenciYap(ogrenci1No, "Birinci");
  await ogrenciYap(ogrenci2No, "İkinci");

  // DİKKAT: damga base36 (harf içerir). Telefon yalnızca rakam olmalı, yoksa
  // kimlik çözümleyici bunu telefon saymaz ve giriş sessizce başarısız olur.
  const veliTelefon = `+90555${String(Date.now()).slice(-7)}`;
  const veliId = await kullaniciYap(
    sentetikEposta(slug, "veli", veliTelefon),
    "Hakan",
    "Veli",
    ["veli"],
    veliTelefon,
  );
  await tek("parent_students", {
    parent_user_id: veliId,
    student_id: ogrenci1Id,
    school_id: okul.id,
    yakinlik: "baba",
  });

  return {
    slug,
    schoolId: okul.id,
    adminEposta,
    ogretmenEposta,
    ogrenci1No,
    ogrenci2No,
    veliTelefon,
    kullaniciIdleri,
  };
}

/**
 * Okulu ve kullanıcılarını siler.
 *
 * Okul satırını silmek public.users'ı cascade ile temizler ama auth.users'ta
 * yetim kayıt bırakır. Sıra bu yüzden önemli: önce auth kullanıcıları (bunlar
 * public.users'a cascade eder), sonra okul.
 */
export async function okuluSil(okul: TestOkulu): Promise<void> {
  const db = servis();
  for (const id of okul.kullaniciIdleri) {
    await db.auth.admin.deleteUser(id);
  }
  await db.from("schools").delete().eq("id", okul.schoolId);
}
