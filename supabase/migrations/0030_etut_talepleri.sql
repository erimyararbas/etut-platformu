-- =============================================================================
-- 0030 — Öğrencinin etüt talebi
--
-- Bugün etüt talep etmenin tek yolu öğretmeni koridorda yakalamak; arayüzde
-- karşılığı yok. Öğrenci "şu dersten şu konuda etüt istiyorum" diyebilecek,
-- talep REHBERLİK SERVİSİNE düşecek (okulun tercihi), rehber ya reddedecek ya
-- da talebi karşılayan etüdü açacak.
--
-- TALEP BİR REZERVASYON DEĞİLDİR. Var olan bir etüde katılmak zaten
-- `rezervasyon_yap` ile oluyor; bu, HENÜZ OLMAYAN bir etüt için istek. İkisini
-- aynı tabloda toplamak, "kontenjanı olmayan rezervasyon" gibi anlamsız bir
-- satır türü doğururdu.
--
-- KARAR ALANLARINI ÖĞRENCİ DOLDURAMAZ. `mentor_submissions` (0022) ile aynı
-- kalıp: insert politikası `durum='bekliyor' and karar_veren is null` şartı
-- koyuyor, UPDATE ise yalnızca rehbere açık.
-- =============================================================================

set search_path = public, extensions;

create type etut_talebi_durumu as enum ('bekliyor', 'karsilandi', 'reddedildi');

create table etut_requests (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(user_id) on delete cascade,
  subject_id  uuid references subjects(id) on delete set null,
  topic_id    uuid references topics(id) on delete set null,
  neden       text not null,
  durum       etut_talebi_durumu not null default 'bekliyor',
  karar_veren uuid references users(id) on delete set null,
  karar_notu  text,
  -- Talep karşılandıysa açılan etüt. `set null`: etüt iptal edilse bile
  -- talebin karşılanmış olduğu bilgisi kaybolmasın.
  etut_id     uuid references etuts(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Karara bağlanmış bir talebin kararı veren kişisi olmak zorunda.
  constraint etut_requests_karar check (durum = 'bekliyor' or karar_veren is not null)
);

create index etut_requests_kuyruk_idx on etut_requests (school_id, durum, created_at);
create index etut_requests_ogrenci_idx on etut_requests (student_id, created_at desc);

create trigger etut_requests_updated_at
  before update on etut_requests
  for each row execute function set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table etut_requests enable row level security;

-- Öğrenci ve velisi kendi taleplerini görür.
create policy etut_requests_ilgili_okur on etut_requests for select
  to authenticated using (ogrenciyi_gorebilir(student_id));

-- Öğrenci KENDİ adına, karar alanları boş talep açar.
create policy etut_requests_ogrenci_acar on etut_requests for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and school_id = auth_school_id()
    and durum = 'bekliyor'
    and karar_veren is null
    and etut_id is null
  );

-- Kuyruk rehberin. Yönetici de görsün: okulun akademik talep trafiğini
-- görmesi rehberlik gizliliğiyle ilgisiz.
create policy etut_requests_rehber on etut_requests for all
  to authenticated
  using (school_id = auth_school_id() and (has_role('rehber') or is_admin()))
  with check (school_id = auth_school_id() and (has_role('rehber') or is_admin()));

grant select, insert on etut_requests to authenticated;
-- Öğrenci karar alanlarını yazamasın diye UPDATE kolon kısıtıyla veriliyor;
-- rehberin geniş yetkisi zaten yukarıdaki politikadan geliyor... ama GRANT
-- rol bazlı değil, tablo bazlı. Bu yüzden UPDATE tabloya açık, hangi SATIRI
-- güncelleyebileceğine politika karar veriyor: öğrencinin UPDATE politikası
-- YOK, dolayısıyla hiçbir satırı güncelleyemez.
grant update on etut_requests to authenticated;
grant all on etut_requests to service_role;

-- =============================================================================
-- Bildirimler
-- =============================================================================

/**
 * Yeni talep → okulun rehberlerine.
 *
 * Alıcı yoksa (okulda rehber tanımlı değilse) bildirim gitmez ama talep
 * kuyrukta durur — `bildirim_soru_soruldu`daki (0021) davranışın aynısı.
 */
create or replace function bildirim_etut_talebi() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alicilar uuid[];
  v_ogrenci  text;
  v_ders     text;
begin
  select array_agg(ur.user_id) into v_alicilar
  from user_roles ur
  join users u on u.id = ur.user_id
  where ur.school_id = new.school_id and ur.role = 'rehber' and u.durum = 'aktif';

  select u.ad || ' ' || u.soyad into v_ogrenci from users u where u.id = new.student_id;
  select s.ad into v_ders from subjects s where s.id = new.subject_id;

  perform bildirim_gonder(
    new.school_id, v_alicilar, 'etut_talebi',
    'Yeni etüt talebi',
    coalesce(v_ogrenci, 'Bir öğrenci') ||
      coalesce(' · ' || v_ders, '') || ' için etüt istedi.',
    jsonb_build_object('talep_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists etut_requests_bildirim on etut_requests;
create trigger etut_requests_bildirim
  after insert on etut_requests
  for each row execute function bildirim_etut_talebi();

/** Karar → öğrenciye. */
create or replace function bildirim_etut_talebi_karari() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.durum <> 'bekliyor' or new.durum = 'bekliyor' then
    return new;
  end if;

  if new.durum = 'karsilandi' then
    perform bildirim_gonder(
      new.school_id, array[new.student_id], 'etut_talebi_karari',
      'Etüt talebin karşılandı',
      case when new.etut_id is null then 'Talebin karşılandı.'
           else etut_etiketi(new.etut_id) || ' etüdü açıldı.' end,
      jsonb_build_object('talep_id', new.id, 'etut_id', new.etut_id)
    );
  else
    perform bildirim_gonder(
      new.school_id, array[new.student_id], 'etut_talebi_karari',
      'Etüt talebin karşılanamadı',
      coalesce(new.karar_notu, 'Talebin bu dönem karşılanamadı.'),
      jsonb_build_object('talep_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists etut_requests_karar_bildirim on etut_requests;
create trigger etut_requests_karar_bildirim
  after update of durum on etut_requests
  for each row execute function bildirim_etut_talebi_karari();
