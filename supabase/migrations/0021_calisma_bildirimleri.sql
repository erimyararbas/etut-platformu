-- =============================================================================
-- 0021 — Faz 2 olayları için bildirimler
--
-- Hedef atama ve soru-yanıt akışı 0016–0017'de kuruldu ama hiçbirine bildirim
-- bağlanmamıştı. Sonuç: öğretmen hedef veriyor, öğrenci ancak ekrana bakarsa
-- görüyor; öğrenci soru soruyor, öğretmen listeyi açana kadar haberi olmuyor;
-- öğretmen yanıtlıyor, öğrenci günlerce fark etmeyebiliyor.
--
-- Yine tetikleyici, yine aynı sebeple (bkz. 0009): bu satırlar birden çok
-- ekrandan yazılabiliyor ve bildirimi uygulama katmanına bırakmak, bir gün
-- birinin unutması demek.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Öğretmen hedef atadı → öğrenciye
-- ---------------------------------------------------------------------------
create or replace function bildirim_hedef_atandi() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ders text;
begin
  -- Öğrencinin kendine koyduğu hedef için bildirim anlamsız.
  if new.assigned_by is null then
    return new;
  end if;

  select ad into v_ders from subjects where id = new.subject_id;

  perform bildirim_gonder(
    new.school_id,
    array[new.student_id],
    'hedef_atandi',
    'Sana yeni bir hedef verildi',
    coalesce(v_ders || ' · ', '') || new.baslik || ' — ' || new.hedef_soru || ' soru' ||
      coalesce(' · son tarih ' || to_char(new.son_tarih, 'DD.MM.YYYY'), ''),
    jsonb_build_object('hedef_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists study_goals_bildirim on study_goals;

create trigger study_goals_bildirim
  after insert on study_goals
  for each row execute function bildirim_hedef_atandi();

-- ---------------------------------------------------------------------------
-- Öğrenci soru sordu → ilgili öğretmenlere
--
-- ALICI SEÇİMİ: okulun TÜM öğretmenlerine göndermek gürültü olurdu ve gürültü
-- olan bildirim okunmaz hale gelir. Sıra:
--   1. Öğrenci belirli bir öğretmeni hedef gösterdiyse yalnızca o,
--   2. yoksa dersin branş öğretmenleri,
--   3. o da yoksa öğrencinin mentörü.
-- Hiçbiri yoksa bildirim gitmez; soru yine de öğretmenlerin "Bekleyenler"
-- listesinde durur, yani kaybolmaz.
-- ---------------------------------------------------------------------------
create or replace function bildirim_soru_soruldu() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alicilar uuid[];
  v_ad       text;
  v_ders     text;
begin
  if new.hedef_ogretmen_id is not null then
    v_alicilar := array[new.hedef_ogretmen_id];
  else
    -- Hesap durumu `teachers`ta değil `users`ta tutuluyor; pasif öğretmene
    -- bildirim göndermenin anlamı yok (bildirim_gonder de zaten eler).
    select coalesce(array_agg(t.user_id), '{}'::uuid[]) into v_alicilar
    from teachers t
    join users u on u.id = t.user_id
    where t.school_id = new.school_id
      and new.subject_id is not null
      and t.brans_subject_id = new.subject_id
      and u.durum = 'aktif';

    if array_length(v_alicilar, 1) is null then
      select coalesce(array_agg(s.mentor_teacher_id), '{}'::uuid[]) into v_alicilar
      from students s
      where s.user_id = new.student_id and s.mentor_teacher_id is not null;
    end if;
  end if;

  if array_length(v_alicilar, 1) is null then
    return new;
  end if;

  select u.ad || ' ' || u.soyad into v_ad from users u where u.id = new.student_id;
  select ad into v_ders from subjects where id = new.subject_id;

  perform bildirim_gonder(
    new.school_id,
    v_alicilar,
    'soru_soruldu',
    'Bir öğrencinin sorusu var',
    v_ad || coalesce(' · ' || v_ders, '') || ' — ' ||
      left(new.metin, 120) || case when length(new.metin) > 120 then '…' else '' end,
    jsonb_build_object('soru_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists unsolved_questions_bildirim on unsolved_questions;

create trigger unsolved_questions_bildirim
  after insert on unsolved_questions
  for each row execute function bildirim_soru_soruldu();

-- ---------------------------------------------------------------------------
-- Öğretmen yanıtladı → soruyu soran öğrenciye
--
-- Veliye GİTMİYOR: öğrencinin nerede takıldığı onunla öğretmeni arasında.
-- Veli bu ekranı zaten göremiyor (bkz. sorular/page.tsx).
-- ---------------------------------------------------------------------------
create or replace function bildirim_soru_yanitlandi() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ogrenci uuid;
  v_ogretmen text;
begin
  select student_id into v_ogrenci from unsolved_questions where id = new.question_id;
  if v_ogrenci is null then
    return new;
  end if;

  select u.ad || ' ' || u.soyad into v_ogretmen from users u where u.id = new.teacher_id;

  perform bildirim_gonder(
    new.school_id,
    array[v_ogrenci],
    'soru_yanitlandi',
    'Sorun yanıtlandı',
    v_ogretmen || ' sorunu yanıtladı.',
    jsonb_build_object('soru_id', new.question_id)
  );

  return new;
end;
$$;

drop trigger if exists question_answers_bildirim on question_answers;

create trigger question_answers_bildirim
  after insert on question_answers
  for each row execute function bildirim_soru_yanitlandi();

-- 0010'daki olay tetikleyicisi PUBLIC/anon yetkisini kendiliğinden kaldırır.
