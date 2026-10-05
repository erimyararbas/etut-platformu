-- =============================================================================
-- 0010 — Yeni fonksiyonların yetkisi otomatik kısıtlansın
--
-- 0009'da dört tetikleyici fonksiyon eklendi ve bunları PUBLIC'ten revoke etmeyi
-- unuttum. Güvenlik ağı testi ("hiçbir SECURITY DEFINER fonksiyonu anon'a veya
-- PUBLIC'e açık değildir") yakaladı — ama testin yakalaması, kuralın kendini
-- uygulaması kadar iyi değil.
--
-- Postgres her yeni fonksiyona PUBLIC üzerinden EXECUTE verir. 0006'da
-- `alter default privileges` ile bunu kapatmıştık, ama o ayar YALNIZCA komutu
-- çalıştıran role bağlıdır: migration'lar farklı yollardan (CLI, connector,
-- kendi script'imiz) uygulandığında farklı rollerle çalışabiliyor ve varsayılan
-- geri geliyor.
--
-- Bu yüzden olay tetikleyicisi (event trigger): public şemasında bir fonksiyon
-- oluşturulduğu anda PUBLIC ve anon yetkisi kaldırılır. Artık unutulamaz.
-- =============================================================================

-- Önce 0009'da açık kalanları kapat.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated, service_role;

-- anon yalnızca giriş sayfasının ihtiyaç duyduğu görünüme erişir (0006).

create or replace function fonksiyon_yetkisi_kisitla()
returns event_trigger
language plpgsql
as $$
declare
  nesne record;
begin
  for nesne in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
      and schema_name = 'public'
  loop
    execute format('revoke execute on function %s from public', nesne.object_identity);
    execute format('revoke execute on function %s from anon', nesne.object_identity);
    execute format(
      'grant execute on function %s to authenticated, service_role',
      nesne.object_identity
    );
  end loop;
end;
$$;

comment on function fonksiyon_yetkisi_kisitla() is
  'Yeni fonksiyonların PUBLIC/anon yetkisini otomatik kaldırır. Bkz. olay tetikleyicisi fonksiyon_yetkisi_kisitla_trg.';

drop event trigger if exists fonksiyon_yetkisi_kisitla_trg;

create event trigger fonksiyon_yetkisi_kisitla_trg
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function fonksiyon_yetkisi_kisitla();

-- Kendisi de aynı kurala tabi.
revoke execute on function fonksiyon_yetkisi_kisitla() from public, anon;
