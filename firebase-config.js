/* ═══════════════════════════════════════════════════════════
   ExpiryTrack — Firebase Bağlantı ve Senkronizasyon Katmanı
   localStorage'daki veriyi Firebase Realtime Database ile
   otomatik senkronize eder. app.js'in kodunu değiştirmez.
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

  const SYNC_KEYS = ['et_users', 'et_products', 'et_stores', 'et_brands', 'et_settings', 'et_notes'];

  // ── Her anahtarı KENDİ SÜRESİNCE bekle, birbirini engellemesin ──
  // Küçük veriler (users, stores, brands) hızlı gelir.
  // Büyük veri (products, görseller içerebilir) için daha uzun süre tanınır.
  // Önemli: HER anahtar için ayrı zaman aşımı var, biri yavaşsa diğerlerini geciktirmez.
  function fetchKey(key, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (got) => { if (!done) { done = true; resolve(got); } };

      if (!firebaseOk) { finish(false); return; }

      dbRef.ref(key).once('value')
        .then((snap) => {
          const val = snap.val();
          if (val !== null && val !== undefined) {
            localStorage.setItem(key, JSON.stringify(val));
            finish(true);
          } else {
            finish(false);
          }
        })
        .catch((err) => { console.warn('[Firebase] okuma hatası:', key, err); finish(false); });

      setTimeout(() => finish(false), timeoutMs);
    });
  }

  // ── AÇILIŞTA: tüm anahtarları paralel çek, hepsi bitince devam et ──
  window.__firebaseReady = Promise.all([
    fetchKey('et_users',    10000),
    fetchKey('et_products', 25000),   // en büyük veri, en uzun süre
    fetchKey('et_stores',   10000),
    fetchKey('et_brands',   10000),
    fetchKey('et_settings', 10000),
    fetchKey('et_notes',    15000),
  ]).then((results) => results.some(Boolean));

  // EKSTRA GÜVENLİK AĞI: Her ihtimale karşı 27 saniye sonra yükleme
  // ekranını zorla kaldır (Promise.all bile askıda kalırsa).
  setTimeout(() => {
    const overlay = document.getElementById('firebaseLoadingOverlay');
    if (overlay) {
      console.warn('[Firebase] Zaman aşımı güvenliği devreye girdi.');
      overlay.remove();
    }
  }, 27000);

  // ── localStorage.setItem'i ele geçir: her yazımda Firebase'e de gönder ──
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (firebaseOk && SYNC_KEYS.includes(key)) {
      try {
        dbRef.ref(key).set(JSON.parse(value))
          .catch((err) => console.warn('[Firebase] yazma hatası:', key, err));
      } catch (e) {
        console.warn('[Firebase] JSON parse hatası:', key, e);
      }
    }
  };

  console.log('[Firebase] Senkronizasyon katmanı hazır.');
})();
