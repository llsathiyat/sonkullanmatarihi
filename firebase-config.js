/* ═══════════════════════════════════════════════════════════
   ExpiryTrack — Firebase Bağlantı ve Senkronizasyon Katmanı
   Bu dosya, localStorage'daki veriyi Firebase Realtime Database
   ile otomatik olarak senkronize eder. app.js'in HİÇBİR
   kısmını değiştirmeden çalışır.
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

  firebase.initializeApp(firebaseConfig);
  const dbRef = firebase.database();

  // Senkronize edilecek anahtarlar (kullanıcı oturumu hariç hepsi)
  const SYNC_KEYS = ['et_users', 'et_products', 'et_stores', 'et_brands', 'et_settings', 'et_notes'];

  // ── 1) AÇILIŞTA: Firebase'den veriyi çek, localStorage'a yaz ──
  window.__firebaseReady = new Promise((resolve) => {
    let pending = SYNC_KEYS.length;
    let gotAny  = false;

    SYNC_KEYS.forEach((key) => {
      dbRef.ref(key).once('value')
        .then((snap) => {
          const val = snap.val();
          if (val !== null && val !== undefined) {
            localStorage.setItem(key, JSON.stringify(val));
            gotAny = true;
          }
        })
        .catch((err) => console.warn('[Firebase] okuma hatası:', key, err))
        .finally(() => {
          pending--;
          if (pending === 0) resolve(gotAny);
        });
    });

    // Firebase 4 saniyede cevap vermezse, eldeki yerel veriyle devam et
    setTimeout(() => resolve(gotAny), 4000);
  });

  // ── 2) localStorage.setItem'i ele geçir: her yazımda Firebase'e de gönder ──
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (SYNC_KEYS.includes(key)) {
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
