-- =============================================================================
-- 0022 — Mentör onay kuyruğu
--
-- Prototipteki "Mentör Onay Kuyruğu": öğrenci çözdüğü soruların fotoğrafını
-- gönderiyor, mentörü onaylıyor veya reddediyor.
--
-- NEDEN ÖNEMLİ: çalışma sayıları (0016) öğrencinin BEYANIDIR — "bugün 20 soru
-- çözdüm" diyebilir ve kimse bakmaz. Onay kuyruğu o beyanı doğrulayan halka;
-- Faz 2'nin geri kalanını anlamlı kılan şey bu.
--
-- KOVA ADI: 0020'de 'soru-gorselleri' olarak açılmıştı, artık mentör
-- gönderilerini de taşıyacak. Ad dar kaldığı ve kova HENÜZ BOŞ olduğu için
-- doğru isme alınıyor — dolu olsaydı taşıma işi olurdu, o yüzden aşağıda
-- boş olduğu doğrulanmadan silinmiyor.
-- =============================================================================

create type gonderi_durumu as enum ('bekliyor', 'onaylandi', 'reddedildi');

create table mentor_submissions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  student_id   uuid not null references students(user_id) on delete cascade,
  -- Gönderinin muhatabı: öğrencinin mentörü. Mentörü yoksa boş kalır ve
  -- okulun personeli değerlendirebilir.
  mentor_id    uuid references teachers(user_id) on delete set null,
  -- Hangi hedefin çalışması olduğu — boş olabilir (serbest çalışma).
  goal_id      uuid references study_goals(id) on delete set null,
  aciklama     text not null,
  gorsel_yolu  text not null,
  durum        gonderi_durumu not null default 'bekliyor',
  karar_notu   text,
  karar_veren  uuid references users(id) on delete set null,
  karar_at     timestamptz,
  created_at   timestamptz not null default now(),
  -- Karar verildiyse kimin verdiği de yazılı olmalı.
  check (durum = 'bekliyor' or karar_veren is not null)
);

create index mentor_submissions_ogrenci_idx
  on mentor_submissions (student_id, created_at desc);
create index mentor_submissions_kuyruk_idx
  on mentor_submissions (school_id, mentor_id) where durum = 'bekliyor';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table mentor_submissions enable row level security;

create policy mentor_submissions_gorunur on mentor_submissions for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

-- Öğrenci yalnızca kendi adına gönderir ve KARAR ALANLARINI dolduramaz;
-- doldurabilseydi kendi gönderisini onaylanmış gösterebilirdi.
create policy mentor_submissions_ogrenci_yazar on mentor_submissions for insert
  to authenticated with check (
    student_id = auth.uid()
    and durum = 'bekliyor'
    and karar_veren is null
    and karar_at is null
  );

-- Kararı yalnızca personel verir.
create policy mentor_submissions_personel_gunceller on mentor_submissions for update
  to authenticated using (is_staff() and school_id = auth_school_id())
  with check (is_staff() and school_id = auth_school_id() and karar_veren = auth.uid());

grant select, insert on mentor_submissions to authenticated;
grant update (durum, karar_notu, karar_veren, karar_at) on mentor_submissions to authenticated;
grant all on mentor_submissions to service_role;

-- ---------------------------------------------------------------------------
-- Bildirimler
-- ---------------------------------------------------------------------------
create or replace function bildirim_gonderi() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alicilar uuid[];
  v_ad       text;
begin
  if tg_op = 'INSERT' then
    -- Muhatabı olan mentör, yoksa öğrencinin mentörü, o da yoksa kimse:
    -- gönderi yine de personelin kuyruğunda durur, kaybolmaz.
    v_alicilar := case
      when new.mentor_id is not null then array[new.mentor_id]
      else (select coalesce(array_agg(s.mentor_teacher_id), '{}'::uuid[])
            from students s
            where s.user_id = new.student_id and s.mentor_teacher_id is not null)
    end;

    if array_length(v_alicilar, 1) is null then
      return new;
    end if;

    select u.ad || ' ' || u.soyad into v_ad from users u where u.id = new.student_id;

    perform bildirim_gonder(new.school_id, v_alicilar, 'gonderi_bekliyor',
      'Onayını bekleyen çalışma var',
      v_ad || ' bir çalışma gönderdi: ' || left(new.aciklama, 100),
      jsonb_build_object('gonderi_id', new.id));

    return new;
  end if;

  -- Karar verildi → öğrenciye
  if old.durum = 'bekliyor' and new.durum <> 'bekliyor' then
    perform bildirim_gonder(new.school_id, array[new.student_id],
      case when new.durum = 'onaylandi' then 'gonderi_onaylandi' else 'gonderi_reddedildi' end,
      case when new.durum = 'onaylandi' then 'Çalışman onaylandı'
           else 'Çalışman geri gönderildi' end,
      case when new.durum = 'onaylandi'
           then left(new.aciklama, 100) || ' — mentörün onayladı.'
           else left(new.aciklama, 100) || ' — gerekçe: ' ||
                coalesce(new.karar_notu, 'belirtilmedi') end,
      jsonb_build_object('gonderi_id', new.id));
  end if;

  return new;
end;
$$;

create trigger mentor_submissions_bildirim
  after insert or update of durum on mentor_submissions
  for each row execute function bildirim_gonderi();

-- ---------------------------------------------------------------------------
-- Kova adı: soru-gorselleri → ogrenci-gorselleri
--
-- Aynı politika kümesi iki içerik türünü de kapsıyor (yol düzeni birebir aynı),
-- ikinci bir kova açmak dört politikayı kopyalamak olurdu.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dosya int;
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage şeması yok (test veritabanı) — kova adımı atlandı.';
    return;
  end if;

  select count(*) into v_dosya from storage.objects where bucket_id = 'soru-gorselleri';
  if v_dosya > 0 then
    raise exception 'soru-gorselleri kovasında % dosya var; ad değişimi taşıma gerektirir.', v_dosya;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ogrenci-gorselleri', 'ogrenci-gorselleri', false, 8388608,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do nothing;

  -- ESKİ KOVA BURADAN SİLİNMİYOR: Supabase storage tablolarından doğrudan
  -- DELETE'e izin vermiyor ("Use the Storage API instead"). Politikaları
  -- kaldırıldığı için erişilemez hale geliyor; kovanın kendisi Storage API
  -- ile (scripts/kova-temizle.mts) kaldırılıyor.

  -- Politikaları yeni kovaya taşı.
  execute 'drop policy if exists soru_gorseli_okur on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogrenci_yazar on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogretmen_yazar on storage.objects';
  execute 'drop policy if exists soru_gorseli_ogrenci_siler on storage.objects';

  execute $pol$
    create policy ogrenci_gorseli_okur on storage.objects for select
      to authenticated
      using (
        bucket_id = 'ogrenci-gorselleri'
        and public.ogrenciyi_gorebilir((storage.foldername(name))[2]::uuid)
      )
  $pol$;

  execute $pol$
    create policy ogrenci_gorseli_ogrenci_yazar on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'ogrenci-gorselleri'
        and (storage.foldername(name))[1]::uuid = public.auth_school_id()
        and (storage.foldername(name))[2]::uuid = auth.uid()
      )
  $pol$;

  execute $pol$
    create policy ogrenci_gorseli_personel_yazar on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'ogrenci-gorselleri'
        and (storage.foldername(name))[1]::uuid = public.auth_school_id()
        and public.is_staff()
        and public.ogrenciyi_gorebilir((storage.foldername(name))[2]::uuid)
      )
  $pol$;

  execute $pol$
    create policy ogrenci_gorseli_ogrenci_siler on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'ogrenci-gorselleri'
        and (storage.foldername(name))[2]::uuid = auth.uid()
      )
  $pol$;
end;
$$;
