-- =============================================================================
-- 0026 — İptal talebini karara bağlama
--
-- BU BİR HATA DÜZELTMESİDİR. `iptalTalebiKarar` (öğretmenin, öğrencinin sınıf
-- etüdünden çıkma talebini onaylaması) öğretmenin oturumuyla `reservations`
-- tablosuna UPDATE atıyordu. Oysa 0005 o tabloya yalnızca SELECT veriyor:
--
--     grant select on reservations to authenticated;
--
-- GRANT olmadan RLS hiç değerlendirilmez; yani bu yol üretimde
-- "permission denied for table reservations" ile başarısız oluyordu ve
-- kimse fark etmemişti — testler talebi AÇMA adımında kesiliyor, karar
-- adımı hiç denenmemiş.
--
-- ÇÖZÜM GRANT VERMEK DEĞİL. 0004'ün yorumu bilinçli: "Yazma işlemi yok:
-- rezervasyon/iptal yalnızca SECURITY DEFINER fonksiyonlarla yapılır, böylece
-- kontenjan ve sıra mantığı atlanamaz." UPDATE yetkisi vermek tam da o kuralı
-- delerdi: kontenjanı ve bekleme listesini atlayan bir yazma yolu açılırdı.
--
-- İKİNCİ KAZANÇ: eski kod talebi onaylayınca yeri boşaltıyor ama BEKLEME
-- LİSTESİNİ İLERLETMİYORDU. Sırada bekleyen öğrenci, önündeki kişi çıkmasına
-- rağmen beklemeye devam ediyordu. Bu fonksiyon `rezervasyon_birak`'taki
-- yükseltme bloğunu kullanıyor, dolayısıyla iptal onayı da sıradakini alır.
-- =============================================================================

set search_path = public, extensions;

create or replace function iptal_talebi_karar(
  p_etut_id    uuid,
  p_student_id uuid,
  p_onay       boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e          etuts%rowtype;
  v_mevcut   reservations%rowtype;
  v_yukselen reservations%rowtype;
begin
  -- Satır kilidi: kontenjan kararı verirken etüt satırı sabit kalmalı
  -- (rezervasyon_yap ve rezervasyon_birak ile aynı kilit).
  select * into e from etuts where id = p_etut_id for update;
  if not found then
    raise exception 'Etüt bulunamadı.' using errcode = 'no_data_found';
  end if;

  -- YETKİ — fonksiyon RLS'i atladığı için kontrol burada.
  -- Etüdü veren öğretmen, okulun yöneticisi ve etüdü AÇAN kişi karar verebilir.
  -- Sonuncusu rehber içindir: rehberin açtığı etüdü öğretmen veriyor ama
  -- öğrenciyi oraya yazan rehber, çıkma talebini de görebilmeli (0028).
  if not servis_baglantisi_mi() then
    if auth.uid() is null
       or (e.teacher_id <> auth.uid()
           and e.created_by is distinct from auth.uid()
           and not (is_admin() and auth_school_id() = e.school_id))
    then
      raise exception 'Bu işlem için yetkiniz yok.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select * into v_mevcut from reservations
   where etut_id = p_etut_id and student_id = p_student_id;

  if not found then
    raise exception 'Kayıt bulunamadı.' using errcode = 'no_data_found';
  end if;

  -- Karara bağlanmış bir talep ikinci kez karara bağlanamaz: aksi hâlde iki
  -- öğretmen aynı talebi açıp farklı kararlar verebilir ve son tıklayan kazanır.
  if v_mevcut.iptal_talebi <> 'bekliyor' then
    raise exception 'Bu talep zaten karara bağlanmış.' using errcode = 'check_violation';
  end if;

  if not p_onay then
    update reservations set iptal_talebi = 'reddedildi' where id = v_mevcut.id;
    return null;
  end if;

  update reservations
     set iptal_talebi = 'onaylandi', durum = 'iptal', sira_no = null
   where id = v_mevcut.id;

  -- Yer boşaldı: sıradaki yükseltilir. `rezervasyon_birak` ile aynı blok.
  if etut_dolu_sayisi(p_etut_id) < e.kontenjan then
    select * into v_yukselen from reservations
     where etut_id = p_etut_id and durum = 'beklemede'
     order by sira_no
     limit 1
     for update;

    if found then
      update reservations set durum = 'rezerve', sira_no = null where id = v_yukselen.id;
      return v_yukselen.student_id;
    end if;
  end if;

  return null;
end;
$$;

comment on function iptal_talebi_karar(uuid, uuid, boolean) is
  'İptal talebini onaylar/reddeder. Onayda yeri boşaltır ve bekleme listesini ilerletir. Yetki kontrolü fonksiyonun içindedir.';

-- 0010''daki olay tetikleyicisi PUBLIC/anon yetkisini zaten kaldırır; niyeti
-- açık bırakmak için burada da yazılı.
revoke execute on function iptal_talebi_karar(uuid, uuid, boolean) from public, anon;
grant execute on function iptal_talebi_karar(uuid, uuid, boolean) to authenticated, service_role;
