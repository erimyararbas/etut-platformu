-- =============================================================================
-- 0012 — users tablosunda korumalı kolonlar
--
-- BULUNAN AÇIK: `users_kendisi_gunceller` politikası (0004) kullanıcının kendi
-- satırını güncellemesine izin veriyor ve WITH CHECK yalnızca `id = auth.uid()`
-- diyor. Hangi KOLONLARIN değişebileceği kısıtlanmamış.
--
-- `auth_school_id()` okulu users.school_id'den okuduğu için, giriş yapmış
-- herhangi bir öğrenci şunu çalıştırabilirdi:
--
--     update users set school_id = '<başka okul>' where id = auth.uid();
--
-- ve o andan itibaren bütün RLS politikaları onu diğer okulun kullanıcısı
-- sayardı. Kiracı izolasyonunun tamamı bu tek kolona bağlı.
--
-- Aynı şekilde kullanıcı kendi `durum`unu 'aktif' yapabilir (yönetici hesabı
-- dondurduktan sonra geri açabilir) veya kendi `setup_token_hash`ini bildiği
-- bir kodun özetiyle değiştirebilirdi.
--
-- Kolon bazlı GRANT burada işe yaramaz: yönetici de `authenticated` rolündedir
-- ve davet kodu yenilemek için bu kolonlara yazabilmelidir. Ayrım satır
-- düzeyinde değil AKTÖR düzeyinde olduğundan tetikleyici doğru araç.
-- =============================================================================

create or replace function users_korumali_kolonlar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sunucu tarafı (içe aktarım, ilk giriş akışı) sınırsızdır.
  if servis_baglantisi_mi() then
    return new;
  end if;

  -- Okul değiştirmek uygulama içi bir eylem değil, veri taşıma işidir.
  -- Yönetici için de kapalı: kendi okulunun kullanıcısını başka okula
  -- taşıyabilmesi kiracı sınırında delik açar.
  if new.school_id is distinct from old.school_id then
    raise exception 'Kullanıcının bağlı olduğu okul değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Kendi okulunun yöneticisi hesap durumunu ve davet kodunu yönetebilir.
  if is_admin() and auth_school_id() = old.school_id then
    return new;
  end if;

  if new.durum is distinct from old.durum
     or new.sifre_belirlendi_mi is distinct from old.sifre_belirlendi_mi
     or new.setup_token_hash is distinct from old.setup_token_hash
     or new.setup_token_expires_at is distinct from old.setup_token_expires_at
  then
    raise exception 'Bu alanı yalnızca okul yöneticisi değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists users_korumali_kolonlar_trg on users;

create trigger users_korumali_kolonlar_trg
  before update on users
  for each row execute function users_korumali_kolonlar();
