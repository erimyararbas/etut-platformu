-- =============================================================================
-- 0032 — Demo bayrağı fonksiyondan görünüme taşınıyor
--
-- 0031 bu soruyu (`bu okulda demo açık mı?`) SECURITY DEFINER bir fonksiyonla
-- cevaplıyordu ve fonksiyonu anon'a açıyordu — giriş ekranı soruyu ziyaretçi
-- oturum açmadan sormak zorunda.
--
-- ONU TEST YAKALADI: `test/yetki.test.ts` içinde "hiçbir SECURITY DEFINER
-- fonksiyonu anon'a veya PUBLIC'e açık değildir" diye mutlak bir kural var ve
-- 0031 o kuralı deliyordu. Kuralı gevşetmek yanlış olurdu: tek bir istisna
-- açıldığında ikincisi tartışmasız gelir.
--
-- Doğru yer zaten vardı. `v_okullar_acik`, "giriş yapmamış ziyaretçinin
-- görebileceği okul bilgisi" için 0004'te açılmış görünüm. Demo bayrağı da
-- tam olarak o: giriş ekranının, kimse giriş yapmadan bilmesi gereken bir
-- şey. Fonksiyon siliniyor, görünüme bir sütun ekleniyor.
-- =============================================================================

set search_path = public, extensions;

drop function if exists demo_modu_acik(text);

-- Görünüm yeniden yaratılıyor: sütun eklemek `create or replace view` ile
-- mümkün ama sütun SIRASI değişmediği sürece; yenisi sona eklendiği için
-- sorun yok. Yine de bağımlılıkları bozmamak adına replace kullanılıyor.
create or replace view v_okullar_acik
  with (security_invoker = off) as
  select
    s.id,
    s.slug,
    s.ad,
    s.logo_url,
    s.tema,
    -- Giriş ekranı "demo olarak incele" düğmesini buna bakarak gösteriyor.
    coalesce(a.demo_modu, false) as demo_modu
  from schools s
  left join school_settings a on a.school_id = s.id
  where s.durum = 'aktif';

grant select on v_okullar_acik to anon, authenticated;
