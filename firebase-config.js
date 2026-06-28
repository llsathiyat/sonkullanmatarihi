/* ═══════════════════════════════════════════════════════════
   ZERA — Firebase Bağlantı ve Senkronizasyon Katmanı
   localStorage'daki veriyi Firebase Realtime Database ile
   otomatik senkronize eder. app.js'in kodunu değiştirmez.

   HIZ STRATEJİSİ:
   - Giriş ekranı SADECE et_users verisi gelince açılır (küçük veri, hızlı).
   - et_products gibi büyük veriler ARKA PLANDA paralel çekilir,
     giriş ekranını ASLA bloklamaz. Geldiğinde ekranlar otomatik tazelenir.

   ÇAKIŞMA ÇÖZÜMÜ (ÖNEMLİ):
   - Diziler (ürünler, mağazalar vb.) Firebase'de TEK BİR BLOB olarak
     değil, HER KAYIT KENDİ ID'Sİ İLE AYRI BİR NODE olarak saklanır.
   - Böylece: Cihaz A bir ürünü silerken Cihaz B başka bir ürün eklerse,
     ikisi de Firebase'de SADECE kendi kaydını değiştirir — birbirinin
     işlemini ezmez. Eski mimaride (dizi tek blob) bu çakışma silinen
     verinin geri gelmesine yol açıyordu.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey:        "AIzaSyBUhWYOog7EbZQ1jsd1JcT3WhR9CdZbPaQ",
    authDomain:    "skt-kontrol-503f1.firebaseapp.com",
    databaseURL:   "https://skt-kontrol-503f1-default-rtdb.firebaseio.com",
    projectId:     "skt-kontrol-503f1",
    storageBucket: "skt-kontrol-503f1.firebasestorage.app",
  };

  let dbRef = null;
  let firebaseOk = false;

  try {
    firebase.initializeApp(firebaseConfig);
    dbRef = firebase.database();
    firebaseOk = true;
  } catch (e) {
    console.warn('[Firebase] başlatma hatası:', e);
  }

  // Bu anahtarlar İÇİNDE bir DİZİ (array) tutan ve her elemanın kendi "id"
  // alanı olan anahtarlar — bunlar Firebase'de tekil kayıt (id bazlı) olarak
  // saklanır, çakışma riski olmadan senkronize edilir.
  const ARRAY_KEYS = ['et_products', 'et_stores', 'et_brands', 'et_users', 'et_notes'];
  // Bu anahtarlar tek bir obje/ayar bütünü — değişikliği nadir, çakışma riski
  // düşük, basit "tüm değeri yaz" yöntemiyle senkronize edilir.
  const BLOB_KEYS  = ['et_settings'];
  // Log ve aktivite verisi: liste ama append-only (üzerine ekleniyor), her
  // girişin kendi zaman damgalı id'si var, tekil kayıt mantığına uygun.
  const LOG_KEYS   = ['et_activity_logs'];
  // last_active: kullanıcı adına göre anahtarlanmış obje (dizi değil),
  // her kullanıcı kendi alanını yazdığı için zaten çakışma riski yok.
  const MAP_KEYS    = ['et_last_active'];

  const SYNC_KEYS = [...ARRAY_KEYS, ...BLOB_KEYS, ...LOG_KEYS, ...MAP_KEYS];

  function fetchKey(key, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (got) => { if (!done) { done = true; resolve(got); } };

      if (!firebaseOk) { finish(false); return; }

      dbRef.ref(key).once('value')
        .then((snap) => {
          const val = snap.val();
          if (val !== null && val !== undefined) {
            let localValue;
            if (ARRAY_KEYS.includes(key) || LOG_KEYS.includes(key)) {
              // Firebase'de { id1: {...}, id2: {...} } şeklinde duruyor,
              // localStorage'a (ve app.js'e) eskisi gibi DİZİ olarak veriyoruz.
              localValue = Object.values(val);
              // Bu anahtarın "bilinen id listesi"ni de güncelle — ileride
              // bu cihazdan bir silme olduğunda doğru tespit edilsin.
              window.__previousArrayState = window.__previousArrayState || {};
              window.__previousArrayState[key] = new Set(Object.keys(val));
            } else {
              localValue = val;
            }
            localStorage.setItem.__original(key, JSON.stringify(localValue));
            finish(true);
          } else {
            finish(false);
          }
        })
        .catch((err) => { console.warn('[Firebase] okuma hatası:', key, err); finish(false); });

      setTimeout(() => finish(false), timeoutMs);
    });
  }

  // ── ÖNCELİKLİ: SADECE kullanıcı listesi — giriş ekranı bunu bekler ──
  window.__usersReady = fetchKey('et_users', 8000);

  // ── ARKA PLAN: büyük veriler — giriş ekranını ASLA bloklamaz ──
  window.__backgroundReady = Promise.all([
    fetchKey('et_products', 30000),
    fetchKey('et_stores',   12000),
    fetchKey('et_brands',   12000),
    fetchKey('et_settings', 12000),
    fetchKey('et_notes',    15000),
    fetchKey('et_activity_logs', 12000),
    fetchKey('et_last_active',   10000),
  ]).then((results) => results.some(Boolean));

  window.__firebaseReady = window.__usersReady;

  // GÜVENLİK AĞI
  setTimeout(() => {
    const overlay = document.getElementById('firebaseLoadingOverlay');
    if (overlay) {
      console.warn('[Firebase] Zaman aşımı güvenliği devreye girdi.');
      overlay.remove();
    }
  }, 10000);

  // ── localStorage.setItem'i ele geçir ──
  // Her dizi öğesi kendi id'siyle ayrı bir Firebase node'una yazılır.
  // Bu sayede iki cihaz aynı anda farklı kayıtlar üzerinde çalışsa bile
  // birbirinin değişikliğini EZMEZ (önceki mimaride bu sorun yaşanıyordu).
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem.__original = originalSetItem; // fetchKey içinde döngüye girmemek için

  window.__previousArrayState = window.__previousArrayState || {};

  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (!firebaseOk || !SYNC_KEYS.includes(key)) return;

    try {
      const parsed = JSON.parse(value);

      if (ARRAY_KEYS.includes(key) || LOG_KEYS.includes(key)) {
        // Diziyi { id: {...} } obje haline çevirip Firebase'e öyle yaz.
        const asObject = {};
        const currentIds = new Set();
        parsed.forEach((item) => {
          if (item && item.id) {
            asObject[item.id] = item;
            currentIds.add(String(item.id));
          }
        });

        // Önceki bilinen halle karşılaştır: hangi id'ler artık yok (silindi)?
        const prevIds = window.__previousArrayState[key] || new Set();
        const removedIds = [...prevIds].filter(id => !currentIds.has(id));

        // Sadece DEĞİŞEN/SİLİNEN kayıtları işle — tüm node'u toptan ezme.
        const updates = {};
        currentIds.forEach(id => { updates[id] = asObject[id]; });
        removedIds.forEach(id => { updates[id] = null; }); // null = Firebase'de o alt-anahtarı siler

        if (Object.keys(updates).length > 0) {
          dbRef.ref(key).update(updates)
            .catch((err) => console.warn('[Firebase] yazma hatası:', key, err));
        }

        window.__previousArrayState[key] = currentIds;
      } else {
        // BLOB_KEYS / MAP_KEYS: tek parça veri, doğrudan yaz (düşük çakışma riski).
        dbRef.ref(key).set(parsed)
          .catch((err) => console.warn('[Firebase] yazma hatası:', key, err));
      }
    } catch (e) {
      console.warn('[Firebase] JSON parse hatası:', key, e);
    }
  };

  console.log('[Firebase] Senkronizasyon katmanı hazır (tekil-kayıt çakışma korumalı).');
})();
