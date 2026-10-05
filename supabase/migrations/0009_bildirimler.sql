-- =============================================================================
-- 0009 — Bildirim üretimi
--
-- NEDEN TETİKLEYİCİ, NEDEN UYGULAMA KATMANI DEĞİL:
--
-- Bildirimlerin bir kısmı zaten veritabanının içinde olup biter. En önemlisi
-- bekleme listesinden yükseltme: `rezervasyon_birak` bir öğrenciyi 'beklemede'
-- durumundan 'rezerve'ye çeker ve bunu uygulama katmanı görmez. Öğrenciye
-- "etüde alındın" denmezse bekleme listesinin bir anlamı kalmaz.
--
-- Aynı şekilde yoklama ve değerlendirme farklı ekranlardan yazılabilir; bildirim
-- her yazana ayrı ayrı eklenmek zorunda kalırsa er geç biri unutulur.
--
-- KANAL BAĞIMSIZLIĞI: `notifications` uygulama içi kaydı tutar. Dışarı çıkan her
-- kanal (SMS, e-posta) için `notification_outbox`'a ayrı satır düşer — ama
-- YALNIZCA okulun açık kanalları için. Varsayılan yalnızca 'inapp' olduğundan
-- şu an outbox'a satır yazılmaz; SMS açıldığında kuyruk kendiliğinden dolmaya
-- başlar ve tek yapılacak iş onu tüketen bir işçi yazmaktır.
-- =============================================================================

alter table school_settings
  add column if not exists aktif_bildirim_kanallari bildirim_kanali[]
    not null default '{inapp}';

comment on column school_settings.aktif_bildirim_kanallari is
  'Açık bildirim kanalları. inapp her zaman vardır; sms/eposta eklenince outbox dolmaya başlar.';

-- ---------------------------------------------------------------------------
-- Çekirdek: bildirim + açık kanallar için outbox satırları
-- ---------------------------------------------------------------------------
create or replace function bildirim_gonder(
  p_school_id uuid,
  p_user_ids  uuid[],
  p_tip       text,
  p_baslik    text,
  p_govde     text,
  p_data      jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer          -- notifications'a kullanıcıların yazma yetkisi yok
set search_path = public
as $$
declare
  v_kanallar bildirim_kanali[];
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  select aktif_bildirim_kanallari into v_kanallar
  from school_settings where school_id = p_school_id;

  with yeni as (
    insert into notifications (school_id, user_id, tip, baslik, govde, data)
    select p_school_id, u, p_tip, p_baslik, p_govde, p_data
    from unnest(p_user_ids) as u
    -- Pasif kullanıcıya bildirim gitmez.
    where exists (select 1 from users x where x.id = u and x.durum = 'aktif')
    returning id, user_id
  )
  insert into notification_outbox (notification_id, school_id, kanal, hedef)
  select y.id, p_school_id, k.kanal,
         case k.kanal when 'sms' then u.telefon else u.eposta end
  from yeni y
  join users u on u.id = y.user_id
  cross join unnest(coalesce(v_kanallar, '{inapp}')) as k(kanal)
  where k.kanal <> 'inapp'   -- inapp zaten notifications satırının kendisi
    and case k.kanal when 'sms' then u.telefon else u.eposta end is not null;
end;
$$;

/** Bir öğrencinin velileri — bildirim alıcıları. */
create or replace function ogrencinin_velileri(p_student_id uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(parent_user_id), '{}'::uuid[])
  from parent_students where student_id = p_student_id;
$$;

/** "Matematik · 17 Eylül 16:00" gibi kısa etüt etiketi. */
create or replace function etut_etiketi(p_etut_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.ad || ' · ' ||
         to_char(e.tarih, 'DD.MM.YYYY') || ' ' ||
         to_char(e.baslangic, 'HH24:MI')
  from etuts e join subjects s on s.id = e.subject_id
  where e.id = p_etut_id;
$$;

-- ---------------------------------------------------------------------------
-- Rezervasyon olayları
-- ---------------------------------------------------------------------------
create or replace function bildirim_rezervasyon() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etiket text := etut_etiketi(new.etut_id);
  v_data   jsonb := jsonb_build_object('etut_id', new.etut_id);
begin
  -- Yeni kayıt
  if tg_op = 'INSERT' then
    if new.durum = 'rezerve' then
      perform bildirim_gonder(new.school_id, array[new.student_id], 'rezervasyon_alindi',
        'Etüt kaydın alındı', v_etiket || ' etüdüne kaydın alındı.', v_data);
    elsif new.durum = 'beklemede' then
      perform bildirim_gonder(new.school_id, array[new.student_id], 'siraya_girdi',
        'Bekleme listesindesin',
        v_etiket || ' etüdünde kontenjan dolu. Sırada ' || new.sira_no || '. kişisin.', v_data);
    elsif new.durum = 'atandi' then
      perform bildirim_gonder(new.school_id,
        array[new.student_id] || ogrencinin_velileri(new.student_id), 'sinif_etuduna_atandi',
        'Sınıf etüdüne atandın',
        v_etiket || ' sınıf etüdüne atandın. Katılım zorunludur.', v_data);
    end if;
    return new;
  end if;

  -- BEKLEME LİSTESİNDEN YÜKSELTME — bu bildirimin kaçırılması bekleme
  -- listesini işlevsiz bırakır.
  if old.durum = 'beklemede' and new.durum = 'rezerve' then
    perform bildirim_gonder(new.school_id,
      array[new.student_id] || ogrencinin_velileri(new.student_id), 'siradan_gecti',
      'Bekleme listesinden etüde alındın',
      'Yer açıldı: ' || v_etiket || ' etüdüne kaydın yapıldı.', v_data);

  elsif old.durum <> 'rezerve' and new.durum = 'rezerve' then
    perform bildirim_gonder(new.school_id, array[new.student_id], 'rezervasyon_alindi',
      'Etüt kaydın alındı', v_etiket || ' etüdüne kaydın alındı.', v_data);

  -- İptal talebinin kararı
  elsif old.iptal_talebi = 'bekliyor' and new.iptal_talebi = 'onaylandi' then
    perform bildirim_gonder(new.school_id,
      array[new.student_id] || ogrencinin_velileri(new.student_id), 'iptal_onaylandi',
      'İptal talebin onaylandı',
      v_etiket || ' etüdünden kaydın düşürüldü.', v_data);

  elsif old.iptal_talebi = 'bekliyor' and new.iptal_talebi = 'reddedildi' then
    perform bildirim_gonder(new.school_id, array[new.student_id], 'iptal_reddedildi',
      'İptal talebin reddedildi',
      v_etiket || ' etüdüne katılman bekleniyor.', v_data);
  end if;

  return new;
end;
$$;

create trigger reservations_bildirim
  after insert or update on reservations
  for each row execute function bildirim_rezervasyon();

-- ---------------------------------------------------------------------------
-- Etüt onay / red — öğretmene
-- ---------------------------------------------------------------------------
create or replace function bildirim_etut_durumu() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etiket text;
begin
  if old.durum = new.durum then
    return new;
  end if;

  v_etiket := etut_etiketi(new.id);

  if new.durum = 'onaylandi' then
    perform bildirim_gonder(new.school_id, array[new.teacher_id], 'etut_onaylandi',
      'Etüdün onaylandı',
      v_etiket || ' etüdün onaylandı ve öğrencilere açıldı.',
      jsonb_build_object('etut_id', new.id));

  elsif new.durum = 'reddedildi' then
    perform bildirim_gonder(new.school_id, array[new.teacher_id], 'etut_reddedildi',
      'Etüdün reddedildi',
      v_etiket || ' etüdün reddedildi. Gerekçe: ' || coalesce(new.red_nedeni, 'belirtilmedi'),
      jsonb_build_object('etut_id', new.id));
  end if;

  return new;
end;
$$;

create trigger etuts_bildirim
  after update of durum on etuts
  for each row execute function bildirim_etut_durumu();

-- ---------------------------------------------------------------------------
-- Devamsızlık — öğrenciye ve velisine
-- ---------------------------------------------------------------------------
create or replace function bildirim_yoklama() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad     text;
  v_etiket text := etut_etiketi(new.etut_id);
begin
  -- Yalnızca devamsızlık bildirilir; her katılım için bildirim gürültü olurdu.
  if new.durum <> 'devamsiz' then
    return new;
  end if;
  -- Aynı durum tekrar kaydedilirse ikinci kez bildirme.
  if tg_op = 'UPDATE' and old.durum = 'devamsiz' then
    return new;
  end if;

  select u.ad || ' ' || u.soyad into v_ad from users u where u.id = new.student_id;

  perform bildirim_gonder(new.school_id, array[new.student_id], 'devamsizlik',
    'Devamsızlık kaydedildi',
    v_etiket || ' etüdüne katılmadığın kaydedildi.',
    jsonb_build_object('etut_id', new.etut_id));

  perform bildirim_gonder(new.school_id, ogrencinin_velileri(new.student_id), 'devamsizlik',
    'Devamsızlık bildirimi',
    v_ad || ', ' || v_etiket || ' etüdüne katılmadı.',
    jsonb_build_object('etut_id', new.etut_id, 'ogrenci_id', new.student_id));

  return new;
end;
$$;

create trigger attendance_bildirim
  after insert or update on attendance
  for each row execute function bildirim_yoklama();

-- ---------------------------------------------------------------------------
-- Değerlendirme — öğrenciye ve velisine
-- ---------------------------------------------------------------------------
create or replace function bildirim_degerlendirme() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ogretmen text;
  v_ogrenci  text;
  v_etiket   text := etut_etiketi(new.etut_id);
begin
  select u.ad || ' ' || u.soyad into v_ogretmen from users u where u.id = new.teacher_id;
  select u.ad || ' ' || u.soyad into v_ogrenci from users u where u.id = new.student_id;

  perform bildirim_gonder(new.school_id, array[new.student_id], 'degerlendirme',
    v_ogretmen || ' seni değerlendirdi',
    v_etiket || ' etüdü için ' || new.yildiz || ' yıldız aldın.',
    jsonb_build_object('etut_id', new.etut_id, 'yildiz', new.yildiz));

  perform bildirim_gonder(new.school_id, ogrencinin_velileri(new.student_id), 'degerlendirme',
    'Yeni öğretmen değerlendirmesi',
    v_ogrenci || ', ' || v_etiket || ' etüdü için ' || new.yildiz || ' yıldız aldı.',
    jsonb_build_object('etut_id', new.etut_id, 'ogrenci_id', new.student_id, 'yildiz', new.yildiz));

  return new;
end;
$$;

create trigger evaluations_bildirim
  after insert or update on evaluations
  for each row execute function bildirim_degerlendirme();

-- ---------------------------------------------------------------------------
-- Yetkiler (bkz. 0006: PUBLIC ve anon varsayılanı kaldırılır)
-- ---------------------------------------------------------------------------
revoke execute on function bildirim_gonder(uuid, uuid[], text, text, text, jsonb) from public, anon;
revoke execute on function ogrencinin_velileri(uuid) from public, anon;
revoke execute on function etut_etiketi(uuid) from public, anon;
grant execute on function etut_etiketi(uuid) to authenticated, service_role;

-- Okunmamış bildirim sayısı için sık sorgulanacak.
create index if not exists notifications_okunmamis_sayim_idx
  on notifications (user_id, created_at desc) where okundu_at is null;
