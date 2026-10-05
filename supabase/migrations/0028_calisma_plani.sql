-- =============================================================================
-- 0028 — Haftalık çalışma planı
--
-- Rehber veya mentör, öğrenciye haftalık bir çalışma planı yazar; öğrenci her
-- satırı "yaptım / yapmadım" diye işaretler. Plan öğrencinin takviminde de
-- görünür.
--
-- YAZMA YETKİSİ `is_staff()` İLE TANIMLANAMAZ. `is_staff()` = admin OR
-- ogretmen OR rehber; bize gereken ise "rehber VEYA bu öğrencinin mentörü".
-- İki küme birbirini kapsamıyor: mentor `is_staff()`in içinde değil, düz
-- öğretmen ise içinde ama plan yazmamalı. Bu yüzden ayrı bir yardımcı var.
--
-- İLERLEME TABLOSU YOK. 0016'da `goal_progress` bilerek açılmamıştı; aynı
-- gerekçe burada da geçerli: öğenin durumu öğenin kendi satırında duruyor.
--
-- ÖĞRENCİ YALNIZCA İŞARETLER. Planı değiştiremez, satır ekleyemez, silemez.
-- Bu, 0011'deki `notifications.okundu_at` kalıbıyla sağlanıyor: tablo
-- genelinde UPDATE geri alınıp yalnızca iki kolon için veriliyor. Politikayla
-- yetinmek yetmezdi — politika satırı seçer, hangi KOLONUN yazılabileceğini
-- seçmez.
-- =============================================================================

set search_path = public, extensions;

create type plan_ogesi_durumu as enum ('bekliyor', 'yapildi', 'yapilmadi');

create table study_plans (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(user_id) on delete cascade,
  -- Haftanın pazartesisi. Uygulama tarafında `haftaBasi()` üretiyor.
  hafta_basi date not null,
  olusturan  uuid not null references users(id) on delete restrict,
  not_metni  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Bir öğrencinin bir haftada TEK planı olur. İki kişi aynı haftaya iki plan
  -- yazarsa öğrencide hangisinin geçerli olduğu belirsiz iki liste oluşur.
  unique (student_id, hafta_basi)
);

create index study_plans_ogrenci_idx on study_plans (student_id, hafta_basi desc);

create table study_plan_items (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  plan_id        uuid not null references study_plans(id) on delete cascade,
  -- Bkz. 0027: RLS politikasının alt sorgu yapmasını önlemek için öğrenci
  -- kimliği burada da tutuluyor.
  student_id     uuid not null references students(user_id) on delete cascade,
  gun            date not null,
  subject_id     uuid references subjects(id) on delete set null,
  topic_id       uuid references topics(id) on delete set null,
  hedef_soru     integer check (hedef_soru is null or (hedef_soru > 0 and hedef_soru <= 5000)),
  durum          plan_ogesi_durumu not null default 'bekliyor',
  isaretlendi_at timestamptz,
  sira           smallint not null default 0,
  created_at     timestamptz not null default now()
);

create index study_plan_items_plan_idx on study_plan_items (plan_id, gun, sira);
create index study_plan_items_ogrenci_gun_idx on study_plan_items (student_id, gun);

create trigger study_plans_updated_at
  before update on study_plans
  for each row execute function set_updated_at();

-- =============================================================================
-- Yetki yardımcıları
-- =============================================================================

/**
 * Bu öğrencinin mentörü müyüm?
 *
 * SECURITY DEFINER olmak zorunda: `students` tablosu RLS altında ve politika
 * içinden yapılan alt sorgular da RLS'e tabi (0023'te aynı tuzağa düşülmüştü).
 */
create or replace function ogrencinin_mentoru_mu(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s
     where s.user_id = p_student_id and s.mentor_teacher_id = auth.uid()
  );
$$;

/**
 * Plan yazabilir mi? Rehber (okulun tamamına) veya öğrencinin mentörü.
 *
 * Düz öğretmen YAZAMAZ: dersine giren her öğretmen plan yazabilseydi aynı
 * haftaya birden çok plan gelir, `unique (student_id, hafta_basi)` yüzünden
 * ikincisi birincinin üzerine yazmak zorunda kalırdı.
 */
create or replace function plan_yazabilir(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (
      has_role('rehber')
      and exists (
        select 1 from students s
         where s.user_id = p_student_id and s.school_id = auth_school_id()
      )
    )
    or ogrencinin_mentoru_mu(p_student_id);
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table study_plans      enable row level security;
alter table study_plan_items enable row level security;

-- Okuma geniş: öğrenci, velisi ve okul personeli (0017'nin ilkesi).
create policy study_plans_gorunur on study_plans for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy study_plans_yazar on study_plans for all
  to authenticated
  using (school_id = auth_school_id() and plan_yazabilir(student_id))
  with check (
    school_id = auth_school_id()
    and plan_yazabilir(student_id)
    and olusturan = auth.uid()
  );

create policy study_plan_items_gorunur on study_plan_items for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

create policy study_plan_items_yazar on study_plan_items for all
  to authenticated
  using (school_id = auth_school_id() and plan_yazabilir(student_id))
  with check (school_id = auth_school_id() and plan_yazabilir(student_id));

-- Öğrenci KENDİ planının öğesini işaretler. Hangi kolonları
-- değiştirebileceğini aşağıdaki kolon düzeyinde GRANT belirliyor.
create policy study_plan_items_ogrenci_isaretler on study_plan_items for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- =============================================================================
-- Yetkiler
-- =============================================================================
grant select, insert, update, delete on study_plans to authenticated;

-- ÖNEMLİ: önce tablo geneli UPDATE alınıyor, sonra yalnızca iki kolon
-- veriliyor. `grant update on study_plan_items` yazılsaydı öğrenci kendi
-- planının hedef soru sayısını da değiştirebilirdi.
grant select, insert, delete on study_plan_items to authenticated;
revoke update on study_plan_items from authenticated;
grant update (durum, isaretlendi_at) on study_plan_items to authenticated;

grant all on study_plans, study_plan_items to service_role;

revoke execute on function ogrencinin_mentoru_mu(uuid) from public, anon;
revoke execute on function plan_yazabilir(uuid)        from public, anon;
grant execute on function ogrencinin_mentoru_mu(uuid)  to authenticated, service_role;
grant execute on function plan_yazabilir(uuid)         to authenticated, service_role;

-- =============================================================================
-- Bildirim — plan yazıldığında öğrenciye
-- =============================================================================
create or replace function bildirim_plan_atandi() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text;
begin
  select u.ad || ' ' || u.soyad into v_ad from users u where u.id = new.olusturan;

  perform bildirim_gonder(
    new.school_id,
    array[new.student_id],
    'plan_atandi',
    'Haftalık çalışma planın hazır',
    coalesce(v_ad, 'Rehberlik servisi') || ' ' ||
      to_char(new.hafta_basi, 'DD.MM.YYYY') || ' haftası için plan yazdı.',
    jsonb_build_object('plan_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists study_plans_bildirim on study_plans;
create trigger study_plans_bildirim
  after insert on study_plans
  for each row execute function bildirim_plan_atandi();
