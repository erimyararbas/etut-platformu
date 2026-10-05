-- =============================================================================
-- 0008 — Veli görünümü
--
-- Veli, çocuğunun ADINI okuyamıyordu: `users` tablosu yalnızca kişinin kendisine
-- ve yöneticiye açık, `v_ogrenci_dizini` ise personele (is_staff). Velinin
-- bağlı olduğu öğrencileri görebilmesi için dar bir görünüm gerekiyor.
--
-- Görünüm SECURITY INVOKER olamaz: `users` üzerindeki RLS veliye çocuğunun
-- satırını vermez. Bu yüzden DEFINER, ama filtre `parent_students` üzerinden
-- auth.uid()'e bağlı — veli yalnızca KENDİ çocuklarını görür ve yalnızca
-- ad/soyad/okul no/sınıf alanlarını (telefon ve e-posta yok).
-- =============================================================================

create or replace view v_velinin_ogrencileri
  with (security_invoker = off) as
  select
    st.user_id as ogrenci_id,
    u.ad,
    u.soyad,
    st.okul_no,
    c.kod as sinif_kodu,
    ps.yakinlik,
    st.school_id
  from parent_students ps
  join students st on st.user_id = ps.student_id
  join users u on u.id = st.user_id
  left join classes c on c.id = st.class_id
  where ps.parent_user_id = auth.uid()
    and u.durum = 'aktif';

comment on view v_velinin_ogrencileri is
  'Velinin bağlı olduğu öğrenciler. Yalnızca ad/soyad/okul no/sınıf — iletişim bilgisi yok.';

grant select on v_velinin_ogrencileri to authenticated;

-- ---------------------------------------------------------------------------
-- Öğrencinin etüt geçmişi: katılım ve değerlendirmeyle birlikte.
--
-- Hem öğrencinin kendisi hem velisi hem de personel kullanabilir; kimin neyi
-- görebileceğine `ogrenciyi_gorebilir()` karar verir. Fonksiyon SECURITY
-- DEFINER'dır (doluluk sayımı ve öğretmen adı için), bu yüzden yetki kontrolü
-- fonksiyonun İÇİNDE yapılır.
-- ---------------------------------------------------------------------------
create or replace function ogrenci_etut_gecmisi(p_student_id uuid)
returns table (
  etut_id        uuid,
  tarih          date,
  baslangic      time,
  bitis          time,
  ders           text,
  konu           text,
  tur            text,
  derslik        text,
  ogretmen_ad    text,
  kayit_durumu   rezervasyon_durumu,
  yoklama        yoklama_durumu,
  yildiz         smallint,
  hazir_yorumlar text[],
  yorum          text
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
      e.id,
      e.tarih,
      e.baslangic,
      e.bitis,
      s.ad,
      t.ad,
      et.ad,
      r.kod,
      (o.ad || ' ' || o.soyad)::text,
      rez.durum,
      a.durum,
      d.yildiz,
      d.hazir_yorumlar,
      d.yorum
    from reservations rez
    join etuts e on e.id = rez.etut_id
    join subjects s on s.id = e.subject_id
    join etut_types et on et.id = e.etut_type_id
    join users o on o.id = e.teacher_id
    left join topics t on t.id = e.topic_id
    left join rooms r on r.id = e.room_id
    left join attendance a on a.etut_id = e.id and a.student_id = p_student_id
    left join evaluations d on d.etut_id = e.id and d.student_id = p_student_id
    where rez.student_id = p_student_id
      and rez.durum <> 'iptal'
      and e.durum = 'onaylandi'
    order by e.tarih desc, e.baslangic desc;
end;
$$;

comment on function ogrenci_etut_gecmisi(uuid) is
  'Öğrencinin etüt geçmişi: katılım ve değerlendirmeyle. Yetki kontrolü fonksiyonun içindedir.';

revoke execute on function ogrenci_etut_gecmisi(uuid) from public, anon;
grant execute on function ogrenci_etut_gecmisi(uuid) to authenticated, service_role;
