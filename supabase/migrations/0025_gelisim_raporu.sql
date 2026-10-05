-- =============================================================================
-- 0025 — Öğrenci gelişim raporu
--
-- Rapor tek bir öğrenciyi beş farklı rol için açıyor: öğrencinin kendisi,
-- velisi, öğretmeni, rehberi ve yöneticisi. Kimlik bilgisini bugün her rol
-- ayrı bir kapıdan okuyor — personel `v_ogrenci_dizini`'nden, veli
-- `v_velinin_ogrencileri`'nden, öğrencinin kendisi ise hiçbirinden (iki
-- görünüm de onu dışarıda bırakıyor). Rapor sayfasının beş ayrı okuma yolu
-- denemesi, beşinci rol eklendiğinde unutulacak bir dallanma olurdu.
--
-- Bu yüzden tek kapı: `ogrenci_kimlik_karti`. Yetki kuralı YENİDEN YAZILMIYOR,
-- `ogrenciyi_gorebilir()` çağrılıyor (0001) — kural tek yerde kalsın.
-- Kalıp `ogrenci_etut_gecmisi` (0008) ile birebir aynı.
--
-- RAPORA REHBERLİK VERİSİ GİRMEZ. Görüşme notları yalnız rehberlik servisine
-- açıktır (0023) ve bu rapor veliye de gider. Buraya `counseling_cases` veya
-- `case_notes` eklemek o kuralı sessizce delerdi.
-- =============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Kimlik kartı
-- ---------------------------------------------------------------------------
create or replace function ogrenci_kimlik_karti(p_student_id uuid)
returns table (
  ad         text,
  soyad      text,
  okul_no    text,
  sinif      text,
  mentor     text,
  okul_adi   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- YETKİ — fonksiyon RLS'i atladığı için kontrol burada.
  if not servis_baglantisi_mi() and not ogrenciyi_gorebilir(p_student_id) then
    raise exception 'Bu öğrencinin kayıtlarını görme yetkiniz yok.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select
      u.ad,
      u.soyad,
      st.okul_no,
      c.kod,
      (mu.ad || ' ' || mu.soyad)::text,
      sc.ad
    from students st
    join users u     on u.id = st.user_id
    join schools sc  on sc.id = st.school_id
    left join classes c on c.id = st.class_id
    left join users mu  on mu.id = st.mentor_teacher_id
    where st.user_id = p_student_id;
end;
$$;

comment on function ogrenci_kimlik_karti(uuid) is
  'Raporun başlığı için öğrenci kimliği. Yetki kontrolü fonksiyonun içindedir.';

revoke execute on function ogrenci_kimlik_karti(uuid) from public, anon;
grant execute on function ogrenci_kimlik_karti(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Çalışma dökümü
--
-- Gün + ders kırılımında toplanıyor, ham oturum satırları dönmüyor: rapor
-- oturumların kendisini değil toplamlarını gösteriyor ve bir aylık ham veri
-- boşuna taşınırdı. Gün kırılımının korunması şart — ders bazında toplasaydım
-- "kaç gün çalıştı" sorusu cevapsız kalırdı, çünkü farklı derslerin günleri
-- toplanamaz, birleştirilmesi gerekir.
--
-- Açık sayaçlar (bitti_at boş) hariç: süresi belli olmayan oturum toplamı
-- yanıltır.
-- ---------------------------------------------------------------------------
create or replace function ogrenci_calisma_dokumu(
  p_student_id uuid,
  p_baslangic  date,
  p_bitis      date
)
returns table (
  calisma_gunu date,
  ders         text,
  dogru        bigint,
  yanlis       bigint,
  bos          bigint,
  sure_saniye  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not servis_baglantisi_mi() and not ogrenciyi_gorebilir(p_student_id) then
    raise exception 'Bu öğrencinin kayıtlarını görme yetkiniz yok.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select
      ss.calisma_gunu,
      coalesce(s.ad, 'Belirtilmemiş')::text,
      sum(ss.dogru)::bigint,
      sum(ss.yanlis)::bigint,
      sum(ss.bos)::bigint,
      coalesce(sum(ss.sure_saniye), 0)::bigint
    from study_sessions ss
    left join subjects s on s.id = ss.subject_id
    where ss.student_id = p_student_id
      and ss.bitti_at is not null
      and ss.calisma_gunu between p_baslangic and p_bitis
    group by ss.calisma_gunu, coalesce(s.ad, 'Belirtilmemiş')
    order by ss.calisma_gunu;
end;
$$;

comment on function ogrenci_calisma_dokumu(uuid, date, date) is
  'Gün ve ders kırılımında çalışma toplamları. Yetki kontrolü fonksiyonun içindedir.';

revoke execute on function ogrenci_calisma_dokumu(uuid, date, date) from public, anon;
grant execute on function ogrenci_calisma_dokumu(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hedef sayıları
--
-- `study_goals` zaten RLS ile okunabilir; sayıları uygulamada da toplayabilirdim.
-- Ayrı fonksiyon olmasının nedeni tek satır dönmesi: aksi hâlde rapor bütün
-- hedef satırlarını çekip sayardı ve hedef listesi büyüdükçe rapor yavaşlardı.
-- ---------------------------------------------------------------------------
create or replace function ogrenci_hedef_ozeti(p_student_id uuid)
returns table (
  aktif        bigint,
  tamamlandi   bigint,
  ogretmenden  bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where durum = 'aktif'),
    count(*) filter (where durum = 'tamamlandi'),
    count(*) filter (where assigned_by is not null)
  from study_goals
  where student_id = p_student_id;
$$;

-- SECURITY INVOKER: study_goals üzerindeki RLS zaten `ogrenciyi_gorebilir`
-- diyor (0017). Yetkisiz çağıran sıfır görür, hata değil — sayım sorgusu.
comment on function ogrenci_hedef_ozeti(uuid) is
  'Hedef sayıları. SECURITY INVOKER: görünürlüğe study_goals RLS karar verir.';

revoke execute on function ogrenci_hedef_ozeti(uuid) from public, anon;
grant execute on function ogrenci_hedef_ozeti(uuid) to authenticated, service_role;
