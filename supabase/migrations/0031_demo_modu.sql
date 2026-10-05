-- =============================================================================
-- 0031 — Demo modu
--
-- Amaç: ürünü tanıtırken (iş başvurusu, okul sunumu) ziyaretçinin şifre
-- olmadan bir role girip gezebilmesi.
--
-- ANAHTAR OKUL BAZINDA VE VERİTABANINDA. Ortam değişkeni de olabilirdi ama
-- o zaman anahtar TÜM okullar için tek olurdu: örnek okulu açmak, aynı
-- dağıtımdaki gerçek okulu da açardı. Burada her okul kendi başına karar
-- veriyor ve varsayılan KAPALI — yani yeni açılan bir okul, kimse bir şey
-- yapmasa bile demo'ya açık doğmaz.
--
-- Bu satırı yalnızca yönetici değiştirebilir (school_settings_admin, 0004);
-- okulun kendi yöneticisi demoyu kapatabilir.
-- =============================================================================

set search_path = public, extensions;

alter table school_settings
  add column if not exists demo_modu boolean not null default false;

comment on column school_settings.demo_modu is
  'Açıkken giriş ekranında "demo olarak incele" seçeneği çıkar ve ziyaretçi şifresiz olarak örnek hesaplara girebilir. Yalnızca tanıtım okullarında açılmalıdır.';

/**
 * Bir okulda demo açık mı?
 *
 * SECURITY DEFINER ve anon'a açık: giriş ekranı, ziyaretçi henüz oturum
 * açmadan bu soruyu sormak zorunda. `school_settings` tablosunun tamamı
 * anon'a açılmıyor — yalnızca bu tek boolean.
 */
create or replace function demo_modu_acik(p_slug text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(a.demo_modu, false)
  from schools s
  join school_settings a on a.school_id = s.id
  where s.slug = p_slug;
$$;

comment on function demo_modu_acik(text) is
  'Giriş ekranı için: bu okulda demo girişi açık mı? Oturum açmamış ziyaretçi de çağırabilir.';

-- 0010''daki olay tetikleyicisi PUBLIC/anon yetkisini kaldırdığı için burada
-- anon'a AÇIKÇA geri veriliyor: giriş sayfasını oturumsuz ziyaretçi görüyor.
revoke execute on function demo_modu_acik(text) from public;
grant execute on function demo_modu_acik(text) to anon, authenticated, service_role;
