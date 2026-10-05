-- =============================================================================
-- 0020 — Soru görselleri için Storage kovası ve erişim kuralları
--
-- Öğrenci çözemediği sorunun fotoğrafını yüklüyor, öğretmen yanıtına çözüm
-- görseli ekleyebiliyor.
--
-- KOVA ÖZEL (public = false). Öğrenci defterinin fotoğrafı tahmin edilebilir
-- bir adresten herkese açık olmamalı; erişim imzalı bağlantıyla veriliyor ve
-- imzayı yalnızca satırı görebilen kullanıcı alabiliyor.
--
-- YOL DÜZENİ: {school_id}/{student_id}/{dosya}
-- İlk iki parça yetki kontrolünün dayanağı: politika dosyanın yolundan
-- hangi öğrenciye ait olduğunu okuyor, ayrı bir tablo aramasına gerek kalmıyor.
--
-- TEST VERİTABANI: PGlite'ta `storage` şeması yok (bkz. test/db.ts — yalnızca
-- `auth` taklit ediliyor). Bu yüzden her şey şema varlığına bağlı; testler bu
-- migration'ı sessizce atlar, üretimde çalışır.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage şeması yok (test veritabanı) — 0020 atlandı.';
    return;
  end if;

  -- --- Kova ---
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'soru-gorselleri',
    'soru-gorselleri',
    false,
    -- 8 MB: telefon fotoğrafı rahat sığar, video sığmaz. Ücretsiz planda
    -- toplam 1 GB alan var; sınırı burada tutmak onu korur.
    8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- --- Politikalar ---
  -- Aynı migration iki kez çalışırsa çakışmasın.
  execute 'drop policy if exists soru_gorseli_okur on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogrenci_yazar on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogretmen_yazar on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogrenci_siler on storage.objects';

  -- Okuma: dosyanın yolundaki öğrenciyi görebilen herkes.
  -- `ogrenciyi_gorebilir` öğrencinin kendisini, velisini ve okul personelini
  -- kapsıyor (0001); kural burada TEKRAR YAZILMIYOR.
  execute $pol$
    create policy soru_gorseli_okur on storage.objects for select
      to authenticated
      using (
        bucket_id = 'soru-gorselleri'
        and public.ogrenciyi_gorebilir((storage.foldername(name))[2]::uuid)
      )
  $pol$;

  -- Yazma: öğrenci yalnızca KENDİ klasörüne ve kendi okulunun altına.
  execute $pol$
    create policy soru_gorseli_ogrenci_yazar on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'soru-gorselleri'
        and (storage.foldername(name))[1]::uuid = public.auth_school_id()
        and (storage.foldername(name))[2]::uuid = auth.uid()
      )
  $pol$;

  -- Öğretmen yanıt görselini öğrencinin klasörüne koyar: soru ve çözümü
  -- birlikte dursun, öğrenci silinince ikisi de aynı yerden gitsin.
  execute $pol$
    create policy soru_gorseli_ogretmen_yazar on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'soru-gorselleri'
        and (storage.foldername(name))[1]::uuid = public.auth_school_id()
        and public.is_staff()
        and public.ogrenciyi_gorebilir((storage.foldername(name))[2]::uuid)
      )
  $pol$;

  -- Silme yalnızca öğrencinin kendisine: yanlış fotoğraf yüklerse kaldırabilsin.
  execute $pol$
    create policy soru_gorseli_ogrenci_siler on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'soru-gorselleri'
        and (storage.foldername(name))[2]::uuid = auth.uid()
      )
  $pol$;
end;
$$;
