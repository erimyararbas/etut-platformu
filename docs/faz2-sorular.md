# Faz 2 — Cevap bekleyen sorular

Bu liste çalışmayı durdurmuyor. Her soru için makul bir varsayımla ilerliyorum;
varsayım "Şimdilik" satırında yazılı ve değiştirilmesi tek noktada mümkün olacak
şekilde kurgulandı. Cevap gelince o satır güncellenir.

---

### 1. Çözemediği soruyu kim yanıtlar?  *(uygulandı, değiştirilebilir)*

Öğrenci "çözemediğim soru" kaydı açtığında bu kimin önüne düşmeli: dersin branş
öğretmeni mi, öğrencinin mentörü mü, yoksa okuldaki herhangi bir öğretmen mi?

**Şimdilik:** Soru bir derse bağlanıyor ve o dersin **tüm branş öğretmenleri**
görebiliyor; ayrıca öğrenci isterse belirli bir öğretmeni hedef gösterebiliyor.
Böylece üç okumanın hepsi çalışır, kısıtlama sonradan daraltılabilir.

---

### 2. Elmas nedir, yıldızdan farkı ne?

Yıldız zaten var: öğretmenin etüt sonrası verdiği 1–5 değerlendirme (Faz 1).
Prototipte ayrıca "elmas" geçiyor. Elması ne kazandırıyor ve ne işe yarıyor?
Harcanabilir bir şey mi, yoksa ikinci bir rozet mi?

**Durum (17 Eylül 2026):** Cevap kullanıcıda da yok — bu, sorulmamış bir soru
değil, henüz verilmemiş bir karar. Ürün kararı olgunlaşana kadar elmas
bağlanmadan bekliyor.

**Şimdilik:** Tek bir `point_ledger` tablosu iki türü de taşıyor (`yildiz`,
`elmas`). Yıldız üretimi 0019'da bağlandı ve çalışıyor; elmas için yalnızca
kazanım tetikleyicisi eksik. Kural netleştiğinde tek bir migration yeter,
şema ve arayüz değişmez.

---

### 3. Günlük seri (streak) neyle korunur?

Prototipte "6 günlük seri" yazıyor. Seriyi ayakta tutan nedir: o gün soru
çözmek mi, herhangi bir çalışma kaydı girmek mi, yoksa etüde katılmak mı?

**Şimdilik:** O gün **en az bir çalışma kaydı** (soru veya süre) girilmesi seriyi
sürdürüyor. Hesap tek bir fonksiyonda; kural değişirse orası değişir.

---

### 4. Hedefi kim atayabilir?

"Bana Atananlar" ekranı öğretmenin atadığı hedefleri gösteriyor. Bunu yalnızca
öğrencinin mentörü mü atayabilmeli, yoksa dersine giren her öğretmen mi?

**Şimdilik:** Öğrencinin mentörü ve okuldaki öğretmenler atayabiliyor; kim
atadıysa `assigned_by` alanında duruyor. Öğrenci kendine de hedef koyabiliyor
(`assigned_by` boş).

---

### 5. Medya hangi ekranlarda olacak?

Çözemediği sorunun fotoğrafı belli. Bunun dışında ödev teslimi, defter
fotoğrafı gibi başka bir yükleme noktası var mı? Video gerekiyor mu?

**Şimdilik:** Soru fotoğrafı, öğretmenin yanıt görseli ve mentör onay
kuyruğundaki çalışma fotoğrafı (0022). Üçü de aynı kovayı kullanıyor
(`ogrenci-gorselleri`), çünkü yol düzeni ve yetki kuralı birebir aynı. Video
yok — ücretsiz Supabase planında 1 GB alan var ve video onu tek başına bitirir.

---

### 6. Çalışma süresi sayacı arka planda çalışmalı mı?

Prototipte "4s 12dk çalışma" yazıyor. Öğrenci sayacı başlatıp telefonu kapatınca
süre işlemeye devam etmeli mi, yoksa yalnızca uygulama açıkken mi sayılmalı?

**Şimdilik:** Başlangıç ve bitiş zamanı kaydediliyor, süre ikisinin farkı.
Uygulama kapansa da süre işler; öğrenci bitirmeyi unutursa kayıt gün sonunda
otomatik kapanır.

---

## Cevaplanmış olanlar

### Net nasıl hesaplanır? → **Net = D − Y/4**

Prototipin çalışma sayacı ekranında açıkça yazıyor. Formül tek bir veritabanı
fonksiyonunda (`net_hesapla`) duruyor; okul bazında değişmesi gerekirse oradan
değişir.
