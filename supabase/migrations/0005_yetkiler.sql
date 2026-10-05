-- =============================================================================
-- 0005 — Tablo yetkileri (GRANT)
--
-- Supabase projesinde "Automatically expose new tables" KAPALI olmalıdır; yeni
-- tablolar kendiliğinden açılmaz, erişim burada açıkça verilir. Böylece bir
-- tablo eklendiğinde ona erişim, biri bu dosyaya yazana kadar yoktur.
--
-- GRANT ile RLS iki ayrı katmandır ve ikisi de gereklidir:
--   GRANT → "bu tabloya hiç dokunabilir misin?"
--   RLS   → "hangi SATIRLARA dokunabilirsin?"
-- GRANT verilmezse RLS politikası hiç devreye girmez, sorgu doğrudan reddedilir.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Yalnızca okuma — bu tablolara hiçbir kullanıcı doğrudan yazamaz.
-- ---------------------------------------------------------------------------

-- Kiracı kaydı: okul oluşturma platform işidir.
grant select on schools to authenticated;

-- Denetim kaydı değiştirilemez olmalı, yoksa denetim kaydı olmaktan çıkar.
grant select on audit_logs to authenticated;

-- İçe aktarım geçmişini sunucu (service_role) yazar.
grant select on import_batches, import_rows to authenticated;

-- Giden bildirim kuyruğunu yalnızca gönderim işçisi yazar.
grant select on notification_outbox to authenticated;

-- Bildirim: okundu işaretlemek için update gerekir, silme/ekleme gerekmez.
grant select, update on notifications to authenticated;

-- Rezervasyon: yazma yolu bilerek kapalıdır. Kontenjan ve bekleme listesi
-- mantığının atlanmaması için tek giriş noktası rezervasyon_yap /
-- rezervasyon_birak fonksiyonlarıdır (bkz. 0002).
grant select on reservations to authenticated;

-- ---------------------------------------------------------------------------
-- Okuma + yazma — hangi satıra dokunulabileceğini RLS belirler.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  school_settings,
  academic_years,
  terms,
  users,
  user_roles,
  grade_levels,
  classes,
  subjects,
  topics,
  rooms,
  etut_types,
  teachers,
  students,
  parent_students,
  etut_recurrences,
  etuts,
  etut_eligible_classes,
  attendance,
  evaluations
to authenticated;

-- ---------------------------------------------------------------------------
-- Servis anahtarı: içe aktarım, kullanıcı oluşturma, bildirim gönderimi.
-- (bypassrls olduğu için RLS'e takılmaz — yalnızca sunucuda kullanılır.)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Fonksiyonlar
--
-- İş kuralı fonksiyonları SECURITY DEFINER'dır; yetki kontrolleri fonksiyonların
-- KENDİ İÇİNDEDİR (bkz. 0002). Burada execute vermek güvenlidir.
-- ---------------------------------------------------------------------------
grant execute on all functions in schema public to authenticated, service_role;

-- anon yalnızca giriş sayfasının okulu tanıması için gereken fonksiyonlara
-- ihtiyaç duyar; v_okullar_acik görünümünün select yetkisi 0004'te verilmiştir.
revoke execute on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- Güvenlik ağı: public şemasındaki her tabloda RLS açık olmalı.
-- Bir tablo eklenip RLS açılmayı unutulursa migration burada durur.
-- ---------------------------------------------------------------------------
do $$
declare
  eksik text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into eksik
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if eksik is not null then
    raise exception 'RLS açılmamış tablo(lar): %', eksik;
  end if;
end;
$$;
