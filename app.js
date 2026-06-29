/* ═══════════════════════════════════════════════════════════
   ZERA v2 — app.js   (STABLE RESTORE)
   Multi-level SaaS | Admin + User Roles | Stores | Brands
═══════════════════════════════════════════════════════════ */
'use strict';

// ── STORAGE KEYS ──
const K = {
  users:    'et_users',
  products: 'et_products',
  stores:   'et_stores',
  brands:   'et_brands',
  settings: 'et_settings',
  theme:    'et_theme',
};

// ── FIXED CATEGORIES ──
const CATEGORIES = TR.FIXED_CATEGORIES;

// ── DB LAYER ──
const db = {
  get:    (key, fb = [])  => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set:    (key, val)      => localStorage.setItem(key, JSON.stringify(val)),
  getObj: (key, fb = {})  => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } },
};

// ── SESSION ──
let SESSION = null;

// ── HELPERS ──
const $      = id => document.getElementById(id);
const esc    = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const isAdmin= () => SESSION?.role === 'admin';
const isViewer = () => SESSION?.role === 'viewer';
const canEdit  = () => isAdmin(); // viewer ve user düzenleyemez

// ── AKTİVİTE LOG SİSTEMİ ──
const LOG_KEY = 'et_activity_logs';
const LOG_VIEWERS = ['ibrahim', 'zehra']; // sadece bu kullanıcılar log panelini görebilir
const canViewLogs = () => SESSION && LOG_VIEWERS.includes(SESSION.username);

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Edg'))     return 'Edge';
  if (ua.includes('Chrome'))  return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari'))  return 'Safari';
  return 'Bilinmeyen Tarayıcı';
}

function detectDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))  return 'iPhone';
  if (/iPad/.test(ua))    return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua))   return 'Windows PC';
  if (/Linux/.test(ua))     return 'Linux PC';
  return 'Bilinmeyen Cihaz';
}

function addLog(username, action, detail = '') {
  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const entry = {
    id: uid(),
    username,
    action,                       // 'login' | 'logout' | 'create' | 'update' | 'delete' | 'image'
    detail,                       // okunabilir açıklama, örn: "Ülker markasının logosunu değiştirdi"
    time: new Date().toISOString(),
    browser: detectBrowser(),
    device: detectDevice(),
  };
  logs.push(entry);
  // Çok büyümesin, son 1000 kaydı tut
  while (logs.length > 1000) logs.shift();
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

function updateLastActive(username) {
  const map = JSON.parse(localStorage.getItem('et_last_active') || '{}');
  map[username] = new Date().toISOString();
  localStorage.setItem('et_last_active', JSON.stringify(map));
}

function timeAgo(isoString) {
  if (!isoString) return 'Hiç giriş yapmadı';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)   return 'Az önce';
  if (mins < 60)  return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs} saat önce`;
  const days = Math.floor(hrs / 24);
  return `${days} gün önce`;
}

// ── IMAGE UPLOAD ──
const IMGBB_API_KEY = 'c72ac2bc01eecd15e895836bd1efec90';
// Global map: containerId → { getValue, setValue, reset }
const uploaders = {};

function createUploader(containerId) {
  const wrap = $(containerId);
  if (!wrap) return null;
  let b64 = '';

  function render() {
    if (b64) {
      wrap.innerHTML =
        `<div class="img-upload-area has-preview">
           <div class="img-preview-wrap">
             <img src="${b64}" alt="önizleme">
             <button type="button" class="img-remove-btn" title="Kaldır"><i class="fas fa-times"></i></button>
           </div>
         </div>
         <span class="img-upload-hint">Değiştirmek için tıklayın · X ile kaldırın</span>`;
      wrap.querySelector('.img-upload-area').addEventListener('click', function(e) {
        if (e.target.closest('.img-remove-btn')) { b64 = ''; render(); return; }
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => { if (inp.files[0]) processFile(inp.files[0]); };
        inp.click();
      });
    } else {
      wrap.innerHTML =
        `<div class="img-upload-area">
           <i class="fas fa-cloud-arrow-up"></i>
           <span>Resim seçmek için tıklayın<br>veya sürükleyip bırakın</span>
         </div>
         <span class="img-upload-hint">PNG, JPG, WEBP • Maks. 5 MB</span>`;
      wrap.querySelector('.img-upload-area').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => { if (inp.files[0]) processFile(inp.files[0]); };
        inp.click();
      });
      wrap.querySelector('.img-upload-area').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
      wrap.querySelector('.img-upload-area').addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));
      wrap.querySelector('.img-upload-area').addEventListener('drop', e => {
        e.preventDefault(); e.currentTarget.classList.remove('drag-over');
        const f = e.dataTransfer?.files[0]; if (f) processFile(f);
      });
    }
  }

  function renderUploading() {
    wrap.innerHTML =
      `<div class="img-upload-area">
         <i class="fas fa-spinner fa-spin"></i>
         <span>Görsel yükleniyor...</span>
       </div>`;
  }

  function processFile(file) {
    if (!file.type.startsWith('image/')) { toast('Geçersiz format. Lütfen bir resim seçin.', 'error'); return; }
    if (file.size > 5242880) { toast('Dosya boyutu 5 MB sınırını aşıyor.', 'error'); return; }
    renderUploading();
    compress(file, 800, file.size > 2097152 ? 0.70 : 0.82, result => {
      uploadToImgBB(result,
        (url) => { b64 = url; render(); },
        (errMsg) => { toast('Görsel yüklenemedi: ' + errMsg, 'error'); b64 = ''; render(); }
      );
    });
  }

  function uploadToImgBB(dataUrl, onSuccess, onError) {
    const base64Only = dataUrl.split(',')[1];
    const formData = new FormData();
    formData.append('image', base64Only);
    fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    })
      .then(res => res.json())
      .then(json => {
        if (json && json.success && json.data && json.data.url) {
          onSuccess(json.data.url);
        } else {
          onError((json && json.error && json.error.message) || 'Bilinmeyen hata');
        }
      })
      .catch(err => onError(err.message || 'Bağlantı hatası'));
  }

  function compress(file, maxPx, quality, cb) {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => toast('Resim okunamadı.', 'error');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  render();
  const api = {
    getValue: () => b64,
    setValue: v  => { b64 = v || ''; render(); },
    reset:    () => { b64 = ''; render(); },
    processExternalFile: f => processFile(f), // barkod taramadan gelen görsel için
  };
  uploaders[containerId] = api;
  return api;
}

// ── AVATAR HELPER ──
function avatarHtml(logo, letter, cls, sz) {
  const style = sz ? `width:${sz}px;height:${sz}px;` : '';
  if (logo) {
    return `<div class="${cls}" style="${style}background:var(--surface2)">
              <img src="${esc(logo)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">
            </div>`;
  }
  return `<div class="${cls}" style="${style}">${esc(letter)}</div>`;
}

// ── EXPIRY HELPERS ──
// Returns exact whole days between today (midnight) and expiry (midnight).
// Positive = future, 0 = today, negative = past.
function daysLeft(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

function expiryStatus(dateStr) {
  const d = daysLeft(dateStr);
  if (d < 0)   return { label: t('statusExpired'),      cls: 'badge-expired', icon: 'fa-skull-crossbones', d };
  if (d === 0) return { label: t('statusToday'),         cls: 'badge-warn1',   icon: 'fa-circle-exclamation', d };
  if (d === 1) return { label: t('statusTomorrow'),      cls: 'badge-warn1',   icon: 'fa-circle-exclamation', d };
  if (d <= 7)  return { label: t('statusDaysLeft', d),   cls: 'badge-warn7',   icon: 'fa-clock', d };
  if (d <= 30) return { label: t('statusDaysLeft', d),   cls: 'badge-warn30',  icon: 'fa-calendar-days', d };
  return         { label: t('statusDaysLeft', d),        cls: 'badge-ok',      icon: 'fa-circle-check', d };
}

function fmtDate(s) {
  return new Date(s).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
}

// ── TOAST ──
function toast(msg, type = 'success') {
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type]}"></i><span>${esc(msg)}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 300); }, 3200);
}

// ── ERROR HELPERS ──
const setErr = (id, msg) => { const e = $(id); if (e) e.textContent = msg; };
const clrErr = (...ids)  => ids.forEach(id => setErr(id, ''));

// ── MODAL ──
function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) closeModal(c.dataset.close);
  const ov = e.target.closest('.modal-overlay');
  if (ov && e.target === ov && ov.id !== 'adminWarningModal') closeModal(ov.id);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => { if (m.id !== 'adminWarningModal') m.classList.remove('open'); });
});

// ── THEME ──
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeIcon').className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  db.set(K.theme, theme);
}
$('themeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
function init() {
  let started = false;
  const start = () => {
    if (started) return; // aynı anda 2 kez çalışmasın
    started = true;
    seedDefaults();
    applyTheme(db.get(K.theme, 'light'));
    applySettings();
    const sess = sessionStorage.getItem('et_session');
    if (sess) { try { SESSION = JSON.parse(sess); updateLastActive(SESSION.username); showApp(); } catch { showLogin(); } }
    else showLogin();
    const overlay = $('firebaseLoadingOverlay');
    if (overlay) overlay.remove();
    // Veri hazır — giriş butonunu aktif et ve görsel olarak belirginleştir
    const loginBtn = $('loginBtn');
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.classList.add('ready');
    }
    const waitMsg = $('loginWaitMsg');
    if (waitMsg) waitMsg.style.display = 'none';
  };

  // Ne olursa olsun 7 saniye sonra uygulamayı başlat (kesin garanti)
  setTimeout(start, 7000);

  try {
    // SADECE kullanıcı verisini bekle — büyük veriler arka planda gelir
    const readyPromise = window.__usersReady || window.__firebaseReady;
    if (readyPromise && typeof readyPromise.then === 'function') {
      readyPromise.then(start).catch(start);
    } else {
      start();
    }
  } catch (e) {
    console.warn('[init] hata, doğrudan başlatılıyor:', e);
    start();
  }

  // Arka planda büyük veriler gelince, açık olan sayfayı otomatik tazele
  if (window.__backgroundReady && typeof window.__backgroundReady.then === 'function') {
    window.__backgroundReady.then(() => {
      console.log('[Firebase] Arka plan verileri (ürünler, mağazalar, vb.) güncellendi.');
      refreshCurrentPage();
    }).catch(() => {});
  }
}

// Şu an ekranda açık olan sayfayı, türüne göre yeniden render eder.
// Arka planda Firebase'den büyük veri gelince ekranı güncellemek için kullanılır.
function refreshCurrentPage() {
  if (!SESSION) return; // henüz giriş yapılmamışsa dokunma
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id.replace('page-', '');
  if (pageId === 'dashboard')    renderDashboard();
  if (pageId === 'productList')  renderProductList();
  if (pageId === 'stores')       renderStores();
  if (pageId === 'brands')       renderBrands();
  if (pageId === 'users')        renderUsers();
  if (pageId === 'productNotes') renderProductNotes();
  if (pageId === 'activityLogs') renderActivityLogs();
}

function seedDefaults() {
  let users = db.get(K.users);

  // Eski varsayılan hesapları kaldır (admin, kullanici) — sadece bir kez çalışır
  const hadOldDefaults = users.some(u => u.username === 'admin' || u.username === 'kullanici');
  if (hadOldDefaults) {
    users = users.filter(u => u.username !== 'admin' && u.username !== 'kullanici');
  }

  // Yeni 8 admin kullanıcıyı, eğer hiç biri yoksa ekle
  const NEW_ADMINS = [
    { username: 'ibrahim', password: '@Jio7oQ*p4o9' },
    { username: 'selim',   password: 'pZ@&@bYe4G6q' },
    { username: 'ali',     password: 'BF155qW@Kbkt' },
    { username: 'yusuf',   password: '!dofI0rzfb6d' },
    { username: 'mevlut',  password: 'XdR8Fh4sR#Yn' },
    { username: 'ahmet',   password: 'p$XZcu$S0D6%' },
    { username: 'behsat',  password: 'IvmS8IE#N7uR' },
    { username: 'zehra',   password: 'Dj6!Zj@RP1wf' },
  ];
  NEW_ADMINS.forEach(({ username, password }) => {
    if (!users.find(u => u.username === username)) {
      users.push({ id: uid(), username, password, role: 'admin', storeId: null });
    }
  });

  // Yeni 8 viewer (gözlemci) kullanıcı — sadece görüntüleme, hiçbir şey ekleyip silemez
  const NEW_VIEWERS = [
    { username: 'levent',  password: 'Z*JjK7Bfe5uU' },
    { username: 'emrah',   password: 'Xtsh9ur5C&$X' },
    { username: 'mehmet',  password: 'r43&EWAmllng' },
    { username: 'ruzgar',  password: '$1RFS3x%J26O' },
    { username: 'tamer',   password: 'ju%UAtZ8EdT!' },
    { username: 'erhan',   password: '4sWSYYu*kqG!' },
    { username: 'kazim',   password: 'evtY1HB#9K*l' },
    { username: 'behiye',  password: 'A2fMsWJY&YCO' },
  ];
  NEW_VIEWERS.forEach(({ username, password }) => {
    if (!users.find(u => u.username === username)) {
      users.push({ id: uid(), username, password, role: 'viewer', storeId: null });
    }
  });

  db.set(K.users, users);
  if (!localStorage.getItem(K.stores))   db.set(K.stores, []);
  if (!localStorage.getItem(K.brands))   db.set(K.brands, []);
  if (!localStorage.getItem(K.products)) db.set(K.products, []);
}

// ── SETTINGS ──
const ZERA_DEFAULT_LOGO = 'data:image/png;base64,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';

function applySettings() {
  const s = db.getObj(K.settings, { appName: 'ZERA', tagline: 'Son Kullanma Takip Sistemi', logo: '' });
  const logoSrc = s.logo || ZERA_DEFAULT_LOGO;
  $('loginAppName').textContent = s.appName;
  $('loginTagline').textContent = s.tagline;
  $('loginLogoWrap').innerHTML  = `<img src="${esc(logoSrc)}" class="brand-logo-img" alt="logo">`;
  $('sidebarAppName').textContent = s.appName;
  $('sidebarLogoWrap').innerHTML  = `<img src="${esc(logoSrc)}" class="brand-logo-img sm" alt="logo">`;
  document.title = s.appName;
  if ($('settingAppName')) {
    $('settingAppName').value = s.appName;
    $('settingTagline').value = s.tagline;
    if (uploaders['appLogoUploader']) uploaders['appLogoUploader'].setValue(s.logo);
  }
}

$('settingsAppForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const oldSettings = db.getObj(K.settings, {});
  const oldLogo = oldSettings.logo || '';
  const logo = uploaders['appLogoUploader']?.getValue() || '';
  db.set(K.settings, {
    appName:  $('settingAppName').value.trim() || 'ZERA',
    tagline:  $('settingTagline').value.trim(),
    logo,
  });
  applySettings();
  if (oldLogo !== logo) addLog(SESSION.username, 'image', 'Uygulamanın ana logosunu değiştirdi');
  addLog(SESSION.username, 'update', 'Sistem ayarlarını (uygulama adı/alt başlık) güncelledi');
  toast(t('settingsSaveSuccess'));
});

$('settingsPassForm')?.addEventListener('submit', e => {
  e.preventDefault();
  clrErr('settingPassErr');
  const np = $('settingNewPass').value;
  if (!np) { setErr('settingPassErr', t('settingsPassErr')); return; }
  const users = db.get(K.users);
  const idx   = users.findIndex(u => u.username === SESSION.username);
  if (idx !== -1) { users[idx].password = np; db.set(K.users, users); }
  $('settingNewPass').value = '';
  toast(t('settingsPassSuccess'));
});

// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════
function showLogin() {
  $('loginPage').classList.remove('hidden');
  $('appShell').classList.add('hidden');
  SESSION = null;
}

function showApp() {
  $('loginPage').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  buildSidebar();
  updateTopbar();
  navigateTo('dashboard');
}

$('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  clrErr('usernameError', 'passwordError');
  const uname = $('loginUsername').value.trim();
  const pass  = $('loginPassword').value;
  if (!uname) { setErr('usernameError', t('loginErrUsername')); return; }
  if (!pass)  { setErr('passwordError', t('loginErrPassword')); return; }

  const btn = $('loginBtn'); btn.classList.add('loading');
  setTimeout(() => {
    const user = db.get(K.users).find(u => u.username === uname && u.password === pass);
    if (!user) {
      btn.classList.remove('loading');
      setErr('passwordError', t('loginErrInvalid'));
      toast(t('loginFailed'), 'error'); return;
    }
    if (user.role === 'user' && !user.storeId) {
      btn.classList.remove('loading');
      setErr('passwordError', t('noStoreAssigned'));
      toast(t('noStoreAssigned'), 'error'); return;
    }
    SESSION = { username: user.username, role: user.role, storeId: user.storeId };
    sessionStorage.setItem('et_session', JSON.stringify(SESSION));
    addLog(user.username, 'login');
    updateLastActive(user.username);
    btn.classList.remove('loading');

    if (user.role === 'admin') {
      showAdminWarningModal();
    } else {
      showApp();
    }
  }, 700);
});

function showAdminWarningModal() {
  const checkbox  = $('adminWarningCheckbox');
  const acceptBtn = $('adminWarningAcceptBtn');
  checkbox.checked = false;
  acceptBtn.disabled = true;
  openModal('adminWarningModal');
}

$('adminWarningCheckbox')?.addEventListener('change', function() {
  $('adminWarningAcceptBtn').disabled = !this.checked;
});

$('adminWarningAcceptBtn')?.addEventListener('click', () => {
  closeModal('adminWarningModal');
  showApp();
});

$('logoutBtn').addEventListener('click', () => {
  if (SESSION) addLog(SESSION.username, 'logout');
  sessionStorage.removeItem('et_session');
  showLogin(); toast(t('logoutSuccess'));
});

// Oturum açıkken her 60 saniyede bir "son aktif" zamanını güncelle
setInterval(() => { if (SESSION) updateLastActive(SESSION.username); }, 60000);

$('togglePw').addEventListener('click', function() {
  const inp = $('loginPassword'), i = this.querySelector('i');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  i.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
});

// ── TOPBAR ──
function updateTopbar() {
  $('topbarUsername').textContent = SESSION.username;
  updateNotifBadge();
}

function updateNotifBadge() {
  const readIds = JSON.parse(localStorage.getItem('et_notif_read') || '[]');
  const urgent  = visibleProducts().filter(p => daysLeft(p.expiry) <= 7);
  const unread  = urgent.filter(p => !readIds.includes(p.id));
  $('notifBadge').textContent = unread.length;
  $('notifBadge').classList.toggle('hidden', unread.length === 0);
}

function renderNotifDropdown() {
  const readIds  = JSON.parse(localStorage.getItem('et_notif_read') || '[]');
  const products = visibleProducts()
    .filter(p => daysLeft(p.expiry) <= 7)
    .sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry));

  const list  = $('notifList');
  const empty = $('notifEmpty');

  if (!products.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = products.map(p => {
    const d   = daysLeft(p.expiry);
    const cls = d < 0 ? 'ep-expired' : d <= 3 ? 'ep-danger' : 'ep-warn';
    const lbl = d < 0 ? `${Math.abs(d)} gün geçti` : d === 0 ? 'Bugün!' : d === 1 ? '1 gün kaldı' : `${d} gün kaldı`;
    const isRead = readIds.includes(p.id);
    return `<div class="notif-item ${cls} ${isRead ? 'notif-read' : ''}" data-id="${p.id}">
      <div class="ep-dot"></div>
      <div style="flex:1;min-width:0">
        <div class="notif-item-name">${esc(p.name)}</div>
        <div class="notif-item-meta">${esc(getStoreName(p.storeId))} · ${esc(getCatName(p.categoryId))}</div>
      </div>
      <span class="notif-item-days">${lbl}</span>
    </div>`;
  }).join('');
}

// Toggle dropdown on bell click
$('notifBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  const dd = $('notifDropdown');
  const isOpen = !dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  if (!isOpen) {
    renderNotifDropdown();
    // Mark all as read when opened
    const products = visibleProducts().filter(p => daysLeft(p.expiry) <= 7);
    localStorage.setItem('et_notif_read', JSON.stringify(products.map(p => p.id)));
    updateNotifBadge();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#notifBtn')) $('notifDropdown')?.classList.add('hidden');
});

$('markAllReadBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  const products = visibleProducts().filter(p => daysLeft(p.expiry) <= 7);
  localStorage.setItem('et_notif_read', JSON.stringify(products.map(p => p.id)));
  updateNotifBadge();
  renderNotifDropdown();
});

$('clearNotifsBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  const products = visibleProducts().filter(p => daysLeft(p.expiry) <= 7);
  localStorage.setItem('et_notif_read', JSON.stringify(products.map(p => p.id)));
  $('notifDropdown').classList.add('hidden');
  updateNotifBadge();
});

// ── SIDEBAR ──
function buildSidebar() {
  $('sidebarUsername').textContent = SESSION.username;
  const roleTag = $('sidebarRoleTag');
  roleTag.textContent = isAdmin() ? t('roleAdmin') : isViewer() ? 'Gözlemci' : t('roleUser');
  roleTag.className   = 'user-role-tag ' + SESSION.role;

  // Viewer rolü "Ürün Ekle" linkini göremez
  const addProductLink = document.querySelector('.nav-item[data-page="addProduct"]');
  if (addProductLink) addProductLink.classList.toggle('hidden', isViewer());

  const nav = $('sidebarNav');
  nav.querySelectorAll('.admin-nav').forEach(el => el.remove());

  if (isAdmin()) {
    const adminItems = [
      { page:'stores',       icon:'fa-store',        label: t('navStores') },
      { page:'brands',       icon:'fa-certificate',  label: t('navBrands') },
      { page:'productNotes', icon:'fa-note-sticky',  label: 'Ürün Notları' },
      { page:'users',        icon:'fa-users',         label: t('navUsers') },
      { page:'settings',     icon:'fa-gear',          label: t('navSettings'), badge: t('navAdminOnly') },
    ];
    const divider = document.createElement('div');
    divider.className = 'nav-section-label admin-nav';
    divider.textContent = 'Yönetim';
    nav.appendChild(divider);
    adminItems.forEach(item => {
      const a = document.createElement('a');
      a.href = '#'; a.className = 'nav-item admin-nav'; a.dataset.page = item.page;
      a.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.label}</span>${item.badge ? `<span class="admin-only-badge">${item.badge}</span>` : ''}`;
      nav.appendChild(a);
    });
  }

  // Aktivite Logları — SADECE ibrahim ve zehra görebilir
  if (canViewLogs()) {
    const a = document.createElement('a');
    a.href = '#'; a.className = 'nav-item admin-nav'; a.dataset.page = 'activityLogs';
    a.innerHTML = `<i class="fas fa-shield-halved"></i><span>Aktivite Logları</span><span class="admin-only-badge" style="background:rgba(239,68,68,.15);color:var(--danger)">Gizli</span>`;
    nav.appendChild(a);
  }

  nav.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.page); });
  });
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
const PAGE_TITLES = {
  dashboard:    t('pageDashboard'),
  addProduct:   t('pageAddProduct'),
  productList:  t('pageProductList'),
  stores:       t('pageStores'),
  brands:       t('pageBrands'),
  users:        t('pageUsers'),
  settings:     t('pageSettings'),
  productNotes: 'Ürün Notları',
  activityLogs: 'Aktivite Logları',
};
const ADMIN_PAGES  = ['stores', 'brands', 'users', 'settings', 'productNotes'];
const EDITOR_PAGES = ['addProduct']; // viewer bu sayfalara giremez

function navigateTo(pageId) {
  if (ADMIN_PAGES.includes(pageId) && !isAdmin()) { toast(t('accessDenied'), 'error'); return; }
  if (EDITOR_PAGES.includes(pageId) && isViewer()) { toast(t('accessDenied'), 'error'); return; }
  if (pageId === 'activityLogs' && !canViewLogs()) { toast(t('accessDenied'), 'error'); return; }
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
  $('pageTitle').textContent = PAGE_TITLES[pageId] || pageId;
  closeMobileSidebar();

  if (pageId === 'dashboard')   renderDashboard();
  if (pageId === 'addProduct')  prepareAddProductForm();
  if (pageId === 'productList') { PF.catId = ''; PF.search = ''; PF.storeId = ''; PF.brandId = ''; renderProductList(); }
  if (pageId === 'stores')      renderStores();
  if (pageId === 'brands')      renderBrands();
  if (pageId === 'users')       renderUsers();
  if (pageId === 'productNotes') renderProductNotes();
  if (pageId === 'activityLogs') renderActivityLogs();
  if (pageId === 'settings') {
    applySettings();
    createUploader('appLogoUploader');
    const s = db.getObj(K.settings, {});
    uploaders['appLogoUploader']?.setValue(s.logo || '');
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-page]');
  if (el && !el.classList.contains('nav-item')) navigateTo(el.dataset.page);
});

// ── MOBILE SIDEBAR ──
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);
$('menuToggle').addEventListener('click', () => { $('sidebar').classList.add('open'); sidebarOverlay.classList.add('show'); });
function closeMobileSidebar() { $('sidebar').classList.remove('open'); sidebarOverlay.classList.remove('show'); }
$('sidebarClose').addEventListener('click', closeMobileSidebar);
sidebarOverlay.addEventListener('click', closeMobileSidebar);

// ════════════════════════════════════════
// DATA HELPERS
// ════════════════════════════════════════
function visibleProducts() {
  const all = db.get(K.products);
  return (isAdmin() || isViewer()) ? all : all.filter(p => p.storeId === SESSION.storeId);
}

function getCatName(id)   { return CATEGORIES.find(c => c.id === id)?.name || id; }
function getStoreName(id) { return db.get(K.stores).find(s => s.id === id)?.name || t('noData'); }
function getBrandName(id) { return db.get(K.brands).find(b => b.id === id)?.name || t('noData'); }

function animateCount(id, target) {
  const el = $(id); if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const dur = 500; let st;
  const step = ts => {
    if (!st) st = ts;
    const p = Math.min((ts - st) / dur, 1);
    el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
function renderDashboard() {
  const products = visibleProducts();
  const stores   = db.get(K.stores);
  const brands   = db.get(K.brands);
  const expired  = products.filter(p => daysLeft(p.expiry) < 0);
  const soon7    = products.filter(p => { const d = daysLeft(p.expiry); return d >= 0 && d <= 7; });
  const soon30   = products.filter(p => { const d = daysLeft(p.expiry); return d > 7 && d <= 30; });

  animateCount('sStores',  stores.length);
  animateCount('sCats',    CATEGORIES.length);
  animateCount('sBrands',  brands.length);
  animateCount('sTotal',   products.length);
  animateCount('sExpired', expired.length);
  animateCount('sSoon7',   soon7.length);
  animateCount('sSoon30',  soon30.length);

  // Dynamic stat card labels
  const lExpired = $('lExpired');
  const lSoon7   = $('lSoon7');
  const lSoon30  = $('lSoon30');
  if (lExpired) lExpired.textContent = expired.length === 0 ? 'Süresi Dolmuş' : `${expired.length} Ürün Dolmuş`;
  if (lSoon7)   lSoon7.textContent   = soon7.length   === 0 ? 'Bu Hafta Dolacak' : `${soon7.length} Ürün — 7 Gün`;
  if (lSoon30)  lSoon30.textContent  = soon30.length  === 0 ? 'Bu Ay Dolacak'    : `${soon30.length} Ürün — 30 Gün`;

  updateNotifBadge();

  const banner = $('alertBanner');
  if (soon7.length || expired.length) {
    banner.classList.remove('hidden');
    const parts = [];
    if (expired.length) parts.push(`${expired.length} ürünün süresi dolmuş`);
    if (soon7.length)   parts.push(`${soon7.length} ürün bu hafta doluyor`);
    $('alertText').textContent = '⚠ ' + parts.join(' · ');
  } else { banner.classList.add('hidden'); }

  const critical = products.filter(p => daysLeft(p.expiry) <= 7)
    .sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 10);

  const tbody = $('criticalTableBody'), empty = $('criticalEmpty');
  if (!critical.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); }
  else {
    empty.classList.add('hidden');
    tbody.innerHTML = critical.map(p => {
      const s = expiryStatus(p.expiry);
      return `<tr class="${s.d < 0 ? 'row-expired' : ''}">
        <td><strong>${esc(p.name)}</strong></td>
        <td>${esc(getStoreName(p.storeId))}</td>
        <td>${esc(getCatName(p.categoryId))}</td>
        <td>${esc(getBrandName(p.brandId))}</td>
        <td>${p.quantity}</td>
        <td>${fmtDate(p.expiry)}</td>
        <td><span class="status-badge ${s.cls}"><i class="fas ${s.icon}"></i>${s.label}</span></td>
      </tr>`;
    }).join('');
  }

  renderExpiryPanel();
}

// ════════════════════════════════════════
// EXPIRY STATUS PANEL (left sidebar on dashboard)
// ════════════════════════════════════════
function renderExpiryPanel() {
  const panel = $('expiryPanel'); if (!panel) return;
  const products = visibleProducts()
    .filter(p => daysLeft(p.expiry) <= 7)
    .sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry));

  if (!products.length) {
    panel.innerHTML = '<div class="expiry-panel-empty"><i class="fas fa-circle-check"></i> Tüm ürünler iyi durumda</div>';
    return;
  }

  panel.innerHTML = products.map(p => {
    const d    = daysLeft(p.expiry);
    const cls  = d < 0 ? 'ep-expired' : d <= 3 ? 'ep-danger' : 'ep-warn';
    const dayLabel = d < 0  ? `${Math.abs(d)} gün geçti`
                   : d === 0 ? 'Bugün!'
                   : d === 1 ? '1 gün kaldı'
                   :           `${d} gün kaldı`;
    return `<div class="expiry-panel-item ${cls}">
      <div class="ep-dot"></div>
      <div class="ep-info">
        <span class="ep-name">${esc(p.name)}</span>
        <span class="ep-meta">${esc(getStoreName(p.storeId))} · ${esc(getCatName(p.categoryId))}</span>
        ${p.note ? `<span class="ep-note"><i class="fas fa-note-sticky"></i> ${esc(p.note)}</span>` : ''}
      </div>
      <span class="ep-days">${esc(dayLabel)}</span>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════
// ADD PRODUCT
// ════════════════════════════════════════
function prepareAddProductForm() {
  populateStoreSelect('pStore');
  populateCatSelect('pCategory');
  populateBrandSelect('pBrand', $('pCategory').value);
  createUploader('pImgUploader');

  // Rebind category→brand only once per page visit
  const catSel = $('pCategory');
  const newCat = catSel.cloneNode(true);
  catSel.parentNode.replaceChild(newCat, catSel);
  newCat.addEventListener('change', () => populateBrandSelect('pBrand', newCat.value));

  if (!isAdmin() && SESSION.storeId) {
    $('pStore').value = SESSION.storeId;
    $('pStore').disabled = true;
  }
}

function populateStoreSelect(selId, selected = '') {
  const sel = $(selId); if (!sel) return;
  sel.innerHTML = `<option value="">Mağaza seçin</option>` +
    db.get(K.stores).map(s => `<option value="${s.id}" ${s.id===selected?'selected':''}>${esc(s.name)}</option>`).join('');
}

function populateCatSelect(selId, selected = '') {
  const sel = $(selId); if (!sel) return;
  sel.innerHTML = `<option value="">Kategori seçin</option>` +
    CATEGORIES.map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
}

function populateBrandSelect(selId, catId = '', selected = '') {
  const sel = $(selId); if (!sel) return;
  const brands = db.get(K.brands).filter(b => !catId || b.categoryId === catId);
  sel.innerHTML = `<option value="">Marka seçin</option>` +
    brands.map(b => `<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('');
}

// ════════════════════════════════════════
// BARKOD TARAMA + ÜRÜN BİLGİSİ SORGULAMA
// ════════════════════════════════════════
let zxingReader = null;
let zxingStream = null;
let barcodeScanLocked = false;       // aynı barkodun tekrar tekrar okunmasını önler
let barcodeScannerMode = 'full';     // 'full' = mevcut davranış (otomatik ürün arama) | 'barcodeOnly' = sadece alanı doldur

// mode parametresi verilmezse eski davranış (mevcut "Tara" butonu) DEĞİŞMEDEN çalışır.
function openBarcodeScanner(mode = 'full') {
  barcodeScannerMode = mode;
  barcodeScanLocked  = false;
  openModal('barcodeScannerModal');
  $('barcodeScannerStatus').textContent = 'Kamera başlatılıyor...';
  $('barcodeScannerStatus').style.color = '';

  if (typeof ZXing === 'undefined') {
    $('barcodeScannerStatus').textContent = 'Tarayıcı kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.';
    $('barcodeScannerStatus').style.color = 'var(--danger)';
    return;
  }

  const videoEl = $('barcodeVideoEl');
  const hints = new Map();
  const formats = [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.QR_CODE,
  ];
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  // PURE_BARCODE kapalı kalmalı (false) — kamera görüntüsünde barkodun etrafında
  // boşluk/ürün ambalajı olur, "tam kare barkod" modu bunu okumayı zorlaştırır.

  zxingReader = new ZXing.BrowserMultiFormatReader(hints, 300); // 300ms: kareler arası tarama sıklığı artırıldı

  // Yatay barkodlar (EAN/UPC) net okunsun diye yüksek çözünürlük ve
  // otomatik odaklama tercih ediliyor — telefon kameraları bunu destekler.
  const videoConstraints = {
    facingMode: 'environment',
    width:  { ideal: 1280 },
    height: { ideal: 720 },
  };

  zxingReader.decodeFromConstraints(
    { video: videoConstraints },
    videoEl,
    (result, err) => {
      if (result && !barcodeScanLocked) {
        barcodeScanLocked = true; // aynı kare/barkod tekrar tekrar tetiklenmesin
        const decodedText = result.getText();
        stopBarcodeScanner();
        closeModal('barcodeScannerModal');
        $('pBarcode').value = decodedText;
        if (barcodeScannerMode === 'full') {
          lookupProductByBarcode(decodedText); // MEVCUT DAVRANIŞ — değişmedi
        }
        // 'barcodeOnly' modunda: sadece alan dolduruldu, otomatik ürün araması YAPILMAZ.
      }
      // err sürekli "bulunamadı" hatası fırlatır taramaya devam ederken — bu normal, görmezden gel
    }
  ).then(() => {
    $('barcodeScannerStatus').textContent = '';
    zxingStream = videoEl.srcObject;
    // Kamera odak modunu "continuous" yapmaya çalış (destekleniyorsa) — bulanıklığı azaltır
    try {
      const track = zxingStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
    } catch (e) { /* desteklenmiyorsa sessizce geç */ }
  }).catch((err) => {
    $('barcodeScannerStatus').textContent = 'Kameraya erişilemedi. Tarayıcı izinlerini kontrol edin.';
    $('barcodeScannerStatus').style.color = 'var(--danger)';
    console.warn('[Barkod Tarayıcı] Kamera hatası:', err);
  });
}

function stopBarcodeScanner() {
  if (zxingReader) {
    try { zxingReader.reset(); } catch (e) {}
    zxingReader = null;
  }
  if (zxingStream) {
    zxingStream.getTracks().forEach(track => track.stop());
    zxingStream = null;
  }
  const videoEl = $('barcodeVideoEl');
  if (videoEl) videoEl.srcObject = null;
  barcodeScanLocked = false;
}

// ── YENİ: Kamera açılmadan önce Mağaza ve Kategori kontrolü ──
// Bu kontrol, mevcut "Tara" ve "Barkod" butonlarının click event'lerini
// YAKALAMA (capture) aşamasında önceden çalışır. Eğer mağaza/kategori
// seçili değilse, kamerayı asla açan asıl handler'a event hiç ulaşmaz
// (stopImmediatePropagation ile durdurulur) — mevcut tarama mantığı
// bu sayede hiç değiştirilmeden, sadece "öncesine" bir kapı eklendi.
function ensureStoreAndCategorySelected() {
  const storeSel = $('pStore');
  const catSel   = $('pCategory');
  if (!storeSel || !catSel) return true; // form yoksa (başka sayfa) engelleme

  // Tek mağaza varsa otomatik seç
  if (!storeSel.value) {
    const stores = db.get(K.stores);
    if (stores.length === 1) {
      storeSel.value = stores[0].id;
    }
  }

  if (!storeSel.value) {
    toast('Lütfen önce bir mağaza seçin.', 'error');
    setErr('pStoreErr', t('errStoreRequired'));
    storeSel.focus();
    return false;
  }
  if (!catSel.value) {
    toast('Lütfen önce bir kategori seçin.', 'error');
    setErr('pCatErr', t('errCatRequired'));
    catSel.focus();
    return false;
  }
  return true;
}

[$('scanBarcodeBtn'), $('scanBarcodeOnlyBtn')].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    if (!ensureStoreAndCategorySelected()) {
      e.preventDefault();
      e.stopImmediatePropagation(); // mevcut openBarcodeScanner çağrısına event ulaşmaz
    }
  }, { capture: true }); // capture: true → diğer listener'lardan ÖNCE çalışır
});

// Mevcut "Tara" butonu — DEĞİŞMEDİ, varsayılan 'full' modunda açılır (otomatik ürün arar)
$('scanBarcodeBtn')?.addEventListener('click', () => openBarcodeScanner('full'));

// Yeni "Barkod" butonu — sadece barkod alanını doldurur, otomatik ürün araması yapmaz
$('scanBarcodeOnlyBtn')?.addEventListener('click', () => openBarcodeScanner('barcodeOnly'));

// Modal kapatılırsa (X veya dışına tıklama) kamerayı da durdur
document.addEventListener('click', e => {
  const closeBtn = e.target.closest('[data-close="barcodeScannerModal"]');
  const overlay  = e.target.closest('#barcodeScannerModal');
  if (closeBtn || (overlay && e.target === overlay)) stopBarcodeScanner();
});

function lookupProductByBarcode(barcode) {
  const msg = $('barcodeScanMsg');
  if (msg) { msg.textContent = 'Ürün bilgisi aranıyor...'; msg.style.color = 'var(--primary)'; }

  fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
    .then(res => res.json())
    .then(data => {
      if (data.status === 1 && data.product) {
        const p = data.product;
        // Türkçe isim varsa onu kullan, yoksa genel isme düş (mevcut davranış aynen korunuyor)
        const name = (p.product_name_tr || p.product_name || '').trim();
        const brandRaw = (p.brands || '').trim();
        const imageUrl = p.image_front_url || p.image_url || '';

        // MEVCUT DAVRANIŞ — DEĞİŞMEDİ: kullanıcı zaten isim yazmışsa üzerine yazma
        if (name && !$('pName').value.trim()) {
          $('pName').value = name;
        }

        // MEVCUT DAVRANIŞ — DEĞİŞMEDİ: görsel varsa indir ve ata
        if (imageUrl) {
          fetchAndSetProductImage(imageUrl);
        }

        // YENİ: Marka eşleştirme — mevcut Marka listesinde ada göre (büyük/küçük
        // harf ve baştaki/sondaki boşluklar gözardı edilerek) eşleşme aranır.
        const brandResult = matchBrandByName(brandRaw, $('pCategory').value);

        if (brandResult.status === 'matched') {
          if (!$('pBrand').value) $('pBrand').value = brandResult.brandId;
          if (msg) { msg.textContent = `✓ Ürün bulundu: ${name || 'isimsiz'} — Marka: ${brandResult.brandName}`; msg.style.color = '#16a34a'; }
          toast('Ürün bilgisi otomatik dolduruldu, lütfen kontrol edin.');
        } else if (brandResult.status === 'not_found') {
          if (msg) { msg.textContent = `"${brandRaw}" markası sistemde kayıtlı değil. Lütfen önce markayı ekleyin, sonra barkodu tekrar okutun.`; msg.style.color = 'var(--danger)'; }
          toast(`"${brandRaw}" markası bulunamadı. Önce markayı ekleyin, barkod ve görsel korundu.`, 'error');
        } else { // 'no_brand_info' — Open Food Facts marka bilgisi döndürmedi
          if (msg) { msg.textContent = `✓ Ürün bulundu: ${name || 'isimsiz'} — Marka bilgisi tespit edilemedi, lütfen elle seçin.`; msg.style.color = '#16a34a'; }
          toast('Ürün bilgisi dolduruldu. Marka bilgisi bulunamadı, lütfen elle seçin.');
        }
      } else {
        // MEVCUT DAVRANIŞ — DEĞİŞMEDİ
        if (msg) { msg.textContent = 'Bu barkod için ürün bilgisi bulunamadı, manuel girebilirsiniz.'; msg.style.color = 'var(--text3)'; }
      }
    })
    .catch(() => {
      if (msg) { msg.textContent = 'Ürün bilgisi sorgulanamadı (bağlantı hatası).'; msg.style.color = 'var(--danger)'; }
    });
}

// YENİ: Open Food Facts'tan gelen marka adını mevcut Marka listesiyle eşleştirir.
// Eşleştirme büyük/küçük harf ve fazladan boşluklara duyarsız çalışır.
// Yeni marka OTOMATİK OLUŞTURULMAZ — talimat gereği sadece mevcut markalar aranır.
function matchBrandByName(brandRaw, catId) {
  if (!brandRaw) return { status: 'no_brand_info' };

  // Open Food Facts birden fazla markayı virgülle ayırarak döndürebilir,
  // ilk markayı esas alıyoruz (genelde ana marka önce gelir).
  const firstBrand = brandRaw.split(',')[0].trim();
  const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const target = normalize(firstBrand);

  const allBrands = db.get(K.brands);
  // Önce seçili kategori içinde ara (daha isabetli), bulunamazsa tüm markalarda ara.
  const inCategory = catId ? allBrands.filter(b => b.categoryId === catId) : [];
  const searchPool = inCategory.length ? inCategory : allBrands;

  const found = searchPool.find(b => normalize(b.name) === target)
             || allBrands.find(b => normalize(b.name) === target);

  if (found) return { status: 'matched', brandId: found.id, brandName: found.name };
  return { status: 'not_found', searchedName: firstBrand };
}

function fetchAndSetProductImage(imageUrl) {
  fetch(imageUrl)
    .then(res => res.blob())
    .then(blob => {
      const file = new File([blob], 'urun.jpg', { type: blob.type || 'image/jpeg' });
      const uploader = uploaders['pImgUploader'];
      if (uploader && typeof uploader.processExternalFile === 'function') {
        uploader.processExternalFile(file);
      }
    })
    .catch(() => { /* görsel alınamadıysa sessizce geç, isim/marka zaten dolduruldu */ });
}

$('addProductForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!canEdit()) { toast(t('accessDenied'), 'error'); return; }
  clrErr('pNameErr','pStoreErr','pCatErr','pBrandErr','pQtyErr','pExpiryErr');
  const f = {
    name:       $('pName').value.trim(),
    storeId:    $('pStore').value,
    categoryId: $('pCategory').value,
    brandId:    $('pBrand').value,
    qty:        $('pQty').value,
    expiry:     $('pExpiry').value,
    barcode:    $('pBarcode').value.trim(),
  };
  let ok = true;
  if (!f.name)       { setErr('pNameErr',   t('errNameRequired'));   ok = false; }
  if (!f.storeId)    { setErr('pStoreErr',  t('errStoreRequired'));  ok = false; }
  if (!f.categoryId) { setErr('pCatErr',    t('errCatRequired'));    ok = false; }
  if (!f.brandId)    { setErr('pBrandErr',  t('errBrandRequired'));  ok = false; }
  if (!f.qty || +f.qty < 1) { setErr('pQtyErr', t('errQtyRequired')); ok = false; }
  if (!f.expiry)     { setErr('pExpiryErr', t('errExpiryRequired')); ok = false; }
  if (!ok) return;

  const btn = $('addProductBtn'); btn.classList.add('loading');
  setTimeout(() => {
    const products = db.get(K.products);
    products.push({ id: uid(), name: f.name, storeId: f.storeId, categoryId: f.categoryId,
      brandId: f.brandId, quantity: +f.qty, expiry: f.expiry, barcode: f.barcode,
      image: uploaders['pImgUploader']?.getValue() || '',
      note: '',
      createdAt: new Date().toISOString() });
    db.set(K.products, products);
    addLog(SESSION.username, 'create', `"${getStoreName(f.storeId)}" mağazasındaki "${getCatName(f.categoryId)}" kategorisine "${f.name}" ürününü ekledi`);
    btn.classList.remove('loading');
    const ov = $('addSuccessOverlay'); ov.classList.add('show');
    toast(t('addProductSuccess', f.name));
    setTimeout(() => { ov.classList.remove('show'); $('addProductForm').reset(); uploaders['pImgUploader']?.reset(); }, 1800);
  }, 500);
});

// ════════════════════════════════════════
// PRODUCT LIST
// ════════════════════════════════════════
let PF = { search:'', storeId:'', catId:'', brandId:'', sort:'expiry-asc' };

function renderProductList() {
  // Kategori seçilmemişse: kart görünümünü göster
  if (!PF.catId) {
    showProductListCatGrid();
    return;
  }

  // Kategori seçilmişse: o kategorinin ürün tablosunu göster
  $('productListCatGrid').classList.add('hidden');
  $('productListDetailView').classList.remove('hidden');
  $('productListSubtitle').textContent = `${getCatName(PF.catId)} kategorisindeki ürünler`;

  populateStoreFilter(); populateBrandFilter();

  let products = visibleProducts().filter(p => p.categoryId === PF.catId);
  if (PF.search) { const q = PF.search.toLowerCase(); products = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||'').includes(q) || getBrandName(p.brandId).toLowerCase().includes(q)); }
  if (PF.storeId) products = products.filter(p => p.storeId  === PF.storeId);
  if (PF.brandId) products = products.filter(p => p.brandId  === PF.brandId);
  products.sort((a, b) => {
    if (PF.sort === 'expiry-asc')  return new Date(a.expiry) - new Date(b.expiry);
    if (PF.sort === 'expiry-desc') return new Date(b.expiry) - new Date(a.expiry);
    if (PF.sort === 'name-asc')    return a.name.localeCompare(b.name, 'tr');
    if (PF.sort === 'name-desc')   return b.name.localeCompare(a.name, 'tr');
    return 0;
  });

  const container = $('productListContainer'), empty = $('productListEmpty');
  if (!products.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  container.innerHTML = `
    <div class="section-card"><div class="product-table-wrap">
      <table class="product-table">
        <thead><tr><th></th><th>Ürün</th><th>Mağaza</th><th>Marka</th><th>Barkod</th><th>Adet</th><th>Son Kullanma</th><th>Durum</th><th>İşlemler</th></tr></thead>
        <tbody>${products.map(p => {
          const s = expiryStatus(p.expiry);
          const noteId = `note-${p.id}`;
          return `<tr class="${s.d<0?'row-expired':''}">
            <td>
              <div class="prod-thumb-wrap">
                ${p.image
                  ? `<img class="prod-thumb" src="${esc(p.image)}" alt="">`
                  : `<div class="prod-thumb prod-thumb-empty"><i class="fas fa-image"></i></div>`}
              </div>
            </td>
            <td><strong>${esc(p.name)}</strong></td>
            <td>${esc(getStoreName(p.storeId))}</td>
            <td>${esc(getBrandName(p.brandId))}</td>
            <td>${p.barcode ? esc(p.barcode) : '<span style="color:var(--text3)">—</span>'}</td>
            <td>${p.quantity}</td>
            <td>${fmtDate(p.expiry)}</td>
            <td><span class="status-badge ${s.cls}"><i class="fas ${s.icon}"></i>${s.label}</span></td>
            <td><div class="row-actions">
              ${p.note ? `<button class="action-btn note-toggle" onclick="toggleProdNote('${noteId}')" title="Notu Göster"><i class="fas fa-note-sticky"></i></button>` : ''}
              ${canEdit() ? `<button class="action-btn edit"   onclick="openEditProduct('${p.id}')" title="Düzenle"><i class="fas fa-pen"></i></button>` : ''}
              ${canEdit() ? `<button class="action-btn delete" onclick="openDeleteItem('product','${p.id}','${esc(p.name)}')" title="Sil"><i class="fas fa-trash"></i></button>` : ''}
            </div></td>
          </tr>
          ${p.note ? `<tr class="prod-note-row" id="${noteId}" style="display:none">
            <td colspan="9"><div class="prod-note-body"><i class="fas fa-note-sticky"></i> ${esc(p.note)}${p.noteImage ? `<img class="note-inline-thumb" src="${esc(p.noteImage)}" alt="">` : ''}</div></td>
          </tr>` : ''}`;
        }).join('')}</tbody>
      </table>
    </div></div>`;
}

function showProductListCatGrid() {
  $('productListDetailView').classList.add('hidden');
  $('productListCatGrid').classList.remove('hidden');
  $('productListSubtitle').textContent = 'Önce bir kategori seçin';

  const products = visibleProducts();
  $('productListCatGrid').innerHTML = CATEGORIES.map((cat, i) => {
    const pCount = products.filter(p => p.categoryId === cat.id).length;
    const iconHtml = cat.image
      ? `<img src="${esc(cat.image)}" alt="${esc(cat.name)}" class="cat-icon-img">`
      : `<i class="fas ${cat.icon}"></i>`;
    return `<div class="cat-card" style="animation-delay:${i*0.06}s" onclick="selectProductListCategory('${cat.id}')">
      <div class="cat-icon-wrap" style="background:${cat.color}22;color:${cat.color}">${iconHtml}</div>
      <div class="cat-card-name">${esc(cat.name)}</div>
      <div class="cat-card-meta">${t('catProducts', pCount)}</div>
    </div>`;
  }).join('');
}

window.selectProductListCategory = function(catId) {
  PF.catId = catId;
  renderProductList();
};

$('backToCatGridBtn')?.addEventListener('click', () => {
  PF.catId = '';
  PF.search = ''; PF.storeId = ''; PF.brandId = '';
  const searchInput = $('searchInput'); if (searchInput) searchInput.value = '';
  renderProductList();
});

function populateStoreFilter() {
  const sel = $('filterStore'); if (!sel) return;
  const stores = isAdmin() ? db.get(K.stores) : db.get(K.stores).filter(s => s.id === SESSION.storeId);
  sel.innerHTML = `<option value="">Tüm Mağazalar</option>` + stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = PF.storeId;
}
function populateCatFilter() {
  const sel = $('filterCat'); if (!sel) return;
  sel.innerHTML = `<option value="">Tüm Kategoriler</option>` + CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = PF.catId;
}
function populateBrandFilter() {
  const sel = $('filterBrand'); if (!sel) return;
  sel.innerHTML = `<option value="">Tüm Markalar</option>` + db.get(K.brands).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  sel.value = PF.brandId;
}

$('searchInput')?.addEventListener('input',  e => { PF.search  = e.target.value; renderProductList(); });
$('filterStore')?.addEventListener('change', e => { PF.storeId = e.target.value; renderProductList(); });
$('filterCat')?.addEventListener('change',   e => { PF.catId   = e.target.value; renderProductList(); });
$('filterBrand')?.addEventListener('change', e => { PF.brandId = e.target.value; renderProductList(); });
$('sortBy')?.addEventListener('change',      e => { PF.sort    = e.target.value; renderProductList(); });

window.toggleProdNote = function(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'table-row';
};

// ── EDIT PRODUCT ──
window.openEditProduct = function(id) {
  if (!canEdit()) { toast(t('accessDenied'), 'error'); return; }
  const p = db.get(K.products).find(x => x.id === id); if (!p) return;
  $('editProdId').value      = p.id;
  $('editProdName').value    = p.name;
  $('editProdQty').value     = p.quantity;
  $('editProdExpiry').value  = p.expiry;
  $('editProdBarcode').value = p.barcode || '';
  populateStoreSelect('editProdStore', p.storeId);
  populateCatSelect('editProdCat', p.categoryId);
  populateBrandSelect('editProdBrand', p.categoryId, p.brandId);

  createUploader('editProdImgUploader');
  uploaders['editProdImgUploader'].setValue(p.image || '');

  // Rebind category change cleanly
  const catSel  = $('editProdCat');
  const newCat  = catSel.cloneNode(true);
  catSel.parentNode.replaceChild(newCat, catSel);
  newCat.addEventListener('change', () => populateBrandSelect('editProdBrand', newCat.value));

  openModal('editProductModal');
};

$('editProductForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!canEdit()) { toast(t('accessDenied'), 'error'); return; }
  const id   = $('editProdId').value;
  const name = $('editProdName').value.trim();
  if (!name || !$('editProdStore').value || !$('editProdCat').value || !$('editProdBrand').value || !$('editProdQty').value || !$('editProdExpiry').value) {
    toast(t('errFieldsRequired'), 'error'); return;
  }
  const products = db.get(K.products);
  const idx = products.findIndex(p => p.id === id); if (idx === -1) return;
  const oldImage = products[idx].image || '';
  const newImage = uploaders['editProdImgUploader']?.getValue() ?? oldImage;
  const imageChanged = newImage !== oldImage;
  products[idx] = { ...products[idx], name,
    storeId:    $('editProdStore').value,
    categoryId: $('editProdCat').value,
    brandId:    $('editProdBrand').value,
    quantity:   +$('editProdQty').value,
    expiry:     $('editProdExpiry').value,
    barcode:    $('editProdBarcode').value.trim(),
    image:      newImage,
    note:       products[idx].note || '',
  };
  db.set(K.products, products);
  const storeName = getStoreName(products[idx].storeId);
  if (imageChanged) {
    addLog(SESSION.username, 'image', `"${storeName}" mağazasındaki "${name}" ürününün görselini değiştirdi`);
  }
  addLog(SESSION.username, 'update', `"${storeName}" mağazasındaki "${name}" ürününü düzenledi`);
  closeModal('editProductModal');
  renderProductList(); renderDashboard();
  toast(t('editSuccess', name));
});

// ════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════
function renderCategories() {
  const products = visibleProducts();
  const brands   = db.get(K.brands);
  $('catCardsGrid').innerHTML = CATEGORIES.map((cat, i) => {
    const pCount = products.filter(p => p.categoryId === cat.id).length;
    const bCount = brands.filter(b => b.categoryId === cat.id).length;
    const iconHtml = cat.image
      ? `<img src="${esc(cat.image)}" alt="${esc(cat.name)}" class="cat-icon-img">`
      : `<i class="fas ${cat.icon}"></i>`;
    return `<div class="cat-card" style="animation-delay:${i*0.06}s" onclick="navigateTo('brands');filterBrandsByCat('${cat.id}')">
      <div class="cat-icon-wrap" style="background:${cat.color}22;color:${cat.color}">${iconHtml}</div>
      <div class="cat-card-name">${esc(cat.name)}</div>
      <div class="cat-card-meta">${t('catBrands', bCount)} · ${t('catProducts', pCount)}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════
// STORES
// ════════════════════════════════════════
function renderStores() {
  const stores   = db.get(K.stores);
  const products = db.get(K.products);
  const grid  = $('storesGrid'), empty = $('storesEmpty');
  if (!stores.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = stores.map((s, i) => {
    const sp       = products.filter(p => p.storeId === s.id);
    const expiredN = sp.filter(p => daysLeft(p.expiry) < 0).length;
    const expiringN= sp.filter(p => { const d = daysLeft(p.expiry); return d >= 0 && d <= 7; }).length;
    const avatar   = avatarHtml(s.logo, s.name[0]?.toUpperCase() || 'M', 'store-avatar');
    return `<div class="store-card" style="animation-delay:${i*0.07}s">
      <div class="store-card-header">${avatar}<div>
        <div class="store-card-name">${esc(s.name)}</div>
        <div class="store-card-desc">${esc(s.desc||'')}</div>
      </div></div>
      <div class="store-card-stats">
        <div class="store-stat"><span class="store-stat-val">${sp.length}</span><span class="store-stat-label">Ürün</span></div>
        <div class="store-stat"><span class="store-stat-val warning">${expiringN}</span><span class="store-stat-label">7 Günde</span></div>
        <div class="store-stat"><span class="store-stat-val danger">${expiredN}</span><span class="store-stat-label">Süresi Dolmuş</span></div>
      </div>
      <div class="store-card-actions">
        <button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="openEditStore('${s.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-danger"    style="padding:6px 12px;font-size:12px" onclick="openDeleteItem('store','${s.id}','${esc(s.name)}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

$('addStoreBtn')?.addEventListener('click', () => {
  $('storeId').value = ''; $('storeName').value = ''; $('storeDesc').value = '';
  $('storeModalTitle').textContent = t('addStoreTitle');
  createUploader('storeLogoUploader');
  openModal('storeModal');
});

window.openEditStore = function(id) {
  const s = db.get(K.stores).find(x => x.id === id); if (!s) return;
  $('storeId').value = s.id; $('storeName').value = s.name; $('storeDesc').value = s.desc || '';
  $('storeModalTitle').textContent = t('editStoreTitle');
  createUploader('storeLogoUploader');
  uploaders['storeLogoUploader']?.setValue(s.logo || '');
  openModal('storeModal');
};

$('storeForm').addEventListener('submit', e => {
  e.preventDefault();
  clrErr('storeNameErr');
  const name = $('storeName').value.trim();
  if (!name) { setErr('storeNameErr', t('storeNameRequired')); return; }
  const stores = db.get(K.stores);
  const id     = $('storeId').value;
  const logo   = uploaders['storeLogoUploader']?.getValue() || '';
  const data   = { name, desc: $('storeDesc').value.trim(), logo };
  if (id) {
    const idx = stores.findIndex(s => s.id === id);
    const oldLogo = stores[idx].logo || '';
    stores[idx] = { ...stores[idx], ...data };
    db.set(K.stores, stores);
    if (oldLogo !== logo) addLog(SESSION.username, 'image', `"${name}" mağazasının görselini değiştirdi`);
    addLog(SESSION.username, 'update', `"${name}" mağazasını düzenledi`);
    toast(t('storeEditSuccess', name));
  } else {
    stores.push({ id: uid(), ...data });
    db.set(K.stores, stores);
    addLog(SESSION.username, 'create', `"${name}" isimli yeni mağaza ekledi`);
    toast(t('storeAddSuccess', name));
  }
  closeModal('storeModal'); renderStores();
});

// ════════════════════════════════════════
// BRANDS
// ════════════════════════════════════════
function renderBrands(filterCatId = '') {
  const brands   = db.get(K.brands);
  const products = db.get(K.products);
  const catSel   = $('brandFilterCat');
  catSel.innerHTML = `<option value="">Tüm Kategoriler</option>` +
    CATEGORIES.map(c => `<option value="${c.id}" ${c.id===filterCatId?'selected':''}>${esc(c.name)}</option>`).join('');

  const filtered = filterCatId ? brands.filter(b => b.categoryId === filterCatId) : brands;
  const grid = $('brandsGrid'), empty = $('brandsEmpty');
  if (!filtered.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map((b, i) => {
    const bp       = products.filter(p => p.brandId === b.id);
    const expiredN = bp.filter(p => daysLeft(p.expiry) < 0).length;
    const expiringN= bp.filter(p => { const d = daysLeft(p.expiry); return d >= 0 && d <= 7; }).length;
    const totalQty = bp.reduce((s, p) => s + p.quantity, 0);
    const avatar   = avatarHtml(b.logo, b.name[0]?.toUpperCase() || 'M', 'brand-avatar');
    return `<div class="brand-card" style="animation-delay:${i*0.06}s">
      <div class="brand-card-header">${avatar}<div>
        <div class="brand-card-name">${esc(b.name)}</div>
        <div class="brand-card-cat">${esc(getCatName(b.categoryId))}</div>
      </div></div>
      <div class="brand-card-stats">
        <div class="brand-stat"><span class="brand-stat-val">${bp.length}</span><span class="brand-stat-label">Ürün</span></div>
        <div class="brand-stat"><span class="brand-stat-val">${totalQty}</span><span class="brand-stat-label">Toplam Adet</span></div>
        <div class="brand-stat"><span class="brand-stat-val warning">${expiringN}</span><span class="brand-stat-label">7 Günde</span></div>
        <div class="brand-stat"><span class="brand-stat-val danger">${expiredN}</span><span class="brand-stat-label">Süresi Dolmuş</span></div>
      </div>
      <div class="brand-card-actions">
        <button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="openEditBrand('${b.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-danger"    style="padding:6px 12px;font-size:12px" onclick="openDeleteItem('brand','${b.id}','${esc(b.name)}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

$('brandFilterCat')?.addEventListener('change', e => renderBrands(e.target.value));
window.filterBrandsByCat = catId => renderBrands(catId);

$('addBrandBtn')?.addEventListener('click', () => {
  $('brandId').value = ''; $('brandName').value = '';
  $('brandCat').innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('brandModalTitle').textContent = t('addBrandTitle');
  createUploader('brandLogoUploader');
  openModal('brandModal');
});

window.openEditBrand = function(id) {
  const b = db.get(K.brands).find(x => x.id === id); if (!b) return;
  $('brandId').value = b.id; $('brandName').value = b.name;
  $('brandCat').innerHTML = CATEGORIES.map(c => `<option value="${c.id}" ${c.id===b.categoryId?'selected':''}>${esc(c.name)}</option>`).join('');
  $('brandModalTitle').textContent = t('editBrandTitle');
  createUploader('brandLogoUploader');
  uploaders['brandLogoUploader']?.setValue(b.logo || '');
  openModal('brandModal');
};

$('brandForm').addEventListener('submit', e => {
  e.preventDefault();
  clrErr('brandNameErr', 'brandCatErr');
  const name  = $('brandName').value.trim();
  const catId = $('brandCat').value;
  if (!name)  { setErr('brandNameErr', t('brandNameRequired')); return; }
  if (!catId) { setErr('brandCatErr',  t('brandCatRequired'));  return; }
  const brands = db.get(K.brands);
  const id     = $('brandId').value;
  const logo   = uploaders['brandLogoUploader']?.getValue() || '';
  const data   = { name, categoryId: catId, logo };
  const catName = getCatName(catId);
  if (id) {
    const idx = brands.findIndex(b => b.id === id);
    const oldLogo = brands[idx].logo || '';
    brands[idx] = { ...brands[idx], ...data };
    db.set(K.brands, brands);
    if (oldLogo !== logo) addLog(SESSION.username, 'image', `"${catName}" kategorisindeki "${name}" markasının logosunu değiştirdi`);
    addLog(SESSION.username, 'update', `"${catName}" kategorisindeki "${name}" markasını düzenledi`);
    toast(t('brandEditSuccess', name));
  } else {
    brands.push({ id: uid(), ...data });
    db.set(K.brands, brands);
    addLog(SESSION.username, 'create', `"${catName}" kategorisine "${name}" isimli yeni marka ekledi`);
    toast(t('brandAddSuccess', name));
  }
  closeModal('brandModal'); renderBrands($('brandFilterCat').value);
});

// ════════════════════════════════════════
// PRODUCT NOTES PAGE (Bağımsız Not Sistemi)
// ════════════════════════════════════════
// Notes are stored in localStorage under key 'et_notes'
// Each note: { id, productId, title, text, image, createdAt }
K.notes = 'et_notes';

function renderProductNotes() {
  const grid  = $('productNotesGrid');
  const empty = $('productNotesEmpty');
  const notes = db.get(K.notes);
  const products = db.get(K.products);

  if (!notes.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = notes.map(n => {
    const p = products.find(x => x.id === n.productId);
    const prodName = p ? esc(p.name) : '<em style="color:var(--text3)">Ürün silinmiş</em>';
    const s = p ? expiryStatus(p.expiry) : null;
    return `<div class="note-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;gap:12px;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          ${n.title ? `<div style="font-weight:700;font-size:15px;color:var(--text1);margin-bottom:4px">${esc(n.title)}</div>` : ''}
          <div style="font-size:12px;color:var(--primary);font-weight:600"><i class="fas fa-box"></i> ${prodName}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="action-btn edit" onclick="openEditNoteModal('${n.id}')" title="Düzenle"><i class="fas fa-pen"></i></button>
          <button class="action-btn delete" onclick="deleteNote('${n.id}')" title="Sil"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      ${s ? `<span class="status-badge ${s.cls}" style="align-self:flex-start;font-size:11px"><i class="fas ${s.icon}"></i>${s.label}</span>` : ''}
      ${n.text ? `<p style="font-size:13px;color:var(--text2);line-height:1.6;margin:0;white-space:pre-wrap">${esc(n.text)}</p>` : ''}
      ${n.image ? `<img src="${esc(n.image)}" alt="" style="max-height:200px;width:100%;object-fit:contain;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface2)">` : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:4px"><i class="fas fa-clock"></i> ${new Date(n.createdAt).toLocaleDateString('tr-TR')}</div>
    </div>`;
  }).join('');
}

function populateNoteProductSelect(selectedId = '') {
  const sel = $('editNoteProdSelect'); if (!sel) return;
  const products = db.get(K.products);
  sel.innerHTML = `<option value="">Ürün seçin...</option>` +
    products.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)} — ${esc(getCatName(p.categoryId))}</option>`).join('');
}

$('addNoteBtn')?.addEventListener('click', () => {
  $('editNoteModalTitle').textContent = 'Yeni Not Ekle';
  $('editNoteId').value    = '';
  $('editNoteTitle').value = '';
  $('editNoteText').value  = '';
  populateNoteProductSelect();
  createUploader('editNoteImgUploader');
  uploaders['editNoteImgUploader']?.reset();
  openModal('editNoteModal');
});

window.openEditNoteModal = function(noteId) {
  const notes = db.get(K.notes);
  const n = notes.find(x => x.id === noteId); if (!n) return;
  $('editNoteModalTitle').textContent = 'Notu Düzenle';
  $('editNoteId').value    = n.id;
  $('editNoteTitle').value = n.title || '';
  $('editNoteText').value  = n.text  || '';
  populateNoteProductSelect(n.productId);
  createUploader('editNoteImgUploader');
  uploaders['editNoteImgUploader']?.setValue(n.image || '');
  openModal('editNoteModal');
};

window.deleteNote = function(noteId) {
  const notes = db.get(K.notes);
  const n = notes.find(x => x.id === noteId);
  if (n) {
    const p = db.get(K.products).find(x => x.id === n.productId);
    addLog(SESSION.username, 'delete', `"${p ? p.name : 'silinmiş ürün'}" ürününe ait notu sildi`);
  }
  db.set(K.notes, notes.filter(n => n.id !== noteId));
  renderProductNotes();
  toast('Not silindi.');
};

$('saveNoteBtn').addEventListener('click', () => {
  const prodId = $('editNoteProdSelect').value;
  if (!prodId) { setErr('editNoteProdErr', 'Lütfen bir ürün seçin'); return; }
  setErr('editNoteProdErr', '');

  const noteId = $('editNoteId').value;
  const notes  = db.get(K.notes);
  const data = {
    productId: prodId,
    title:     $('editNoteTitle').value.trim(),
    text:      $('editNoteText').value.trim(),
    image:     uploaders['editNoteImgUploader']?.getValue() || '',
  };
  const p = db.get(K.products).find(x => x.id === prodId);
  const prodName = p ? p.name : 'bilinmeyen ürün';

  if (noteId) {
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx !== -1) notes[idx] = { ...notes[idx], ...data };
    addLog(SESSION.username, 'update', `"${prodName}" ürününe ait notu güncelledi`);
  } else {
    notes.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
    addLog(SESSION.username, 'create', `"${prodName}" ürününe yeni not ekledi`);
  }

  db.set(K.notes, notes);
  closeModal('editNoteModal');
  renderProductNotes();
  toast(noteId ? 'Not güncellendi.' : 'Not eklendi.');
});

// ════════════════════════════════════════
// AKTİVİTE LOGLARI (sadece ibrahim & zehra)
// ════════════════════════════════════════
function renderActivityLogs() {
  if (!canViewLogs()) return;

  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    .slice()
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  const lastActiveMap = JSON.parse(localStorage.getItem('et_last_active') || '{}');
  const allUsers = db.get(K.users);

  // ── Üst kısım: Kullanıcıların "son aktif" durumu ──
  const statusGrid = $('logsStatusGrid');
  if (statusGrid) {
    statusGrid.innerHTML = allUsers.map(u => {
      const last = lastActiveMap[u.username];
      const mins = last ? Math.floor((Date.now() - new Date(last).getTime()) / 60000) : Infinity;
      const isOnline = mins < 3; // son 3 dakikada aktifse "çevrimiçi" say
      return `<div class="log-user-card">
        <div class="log-user-dot ${isOnline ? 'online' : ''}"></div>
        <div class="log-user-info">
          <span class="log-user-name">${esc(u.username)}</span>
          <span class="log-user-role">${u.role === 'admin' ? 'Admin' : u.role === 'viewer' ? 'Gözlemci' : 'Kullanıcı'}</span>
        </div>
        <span class="log-user-time">${esc(timeAgo(last))}</span>
      </div>`;
    }).join('');
  }

  // ── Alt kısım: Detaylı işlem log tablosu ──
  const tbody = $('logsTableBody'), empty = $('logsEmpty');
  if (!logs.length) { if(tbody) tbody.innerHTML = ''; if(empty) empty.classList.remove('hidden'); return; }
  if(empty) empty.classList.add('hidden');

  const ACTION_BADGES = {
    login:  '<span class="log-action-badge in"><i class="fas fa-right-to-bracket"></i> Giriş</span>',
    logout: '<span class="log-action-badge out"><i class="fas fa-right-from-bracket"></i> Çıkış</span>',
    create: '<span class="log-action-badge create"><i class="fas fa-plus"></i> Ekleme</span>',
    update: '<span class="log-action-badge update"><i class="fas fa-pen"></i> Düzenleme</span>',
    delete: '<span class="log-action-badge delete"><i class="fas fa-trash"></i> Silme</span>',
    image:  '<span class="log-action-badge image"><i class="fas fa-image"></i> Görsel</span>',
  };

  if (tbody) {
    tbody.innerHTML = logs.slice(0, 500).map(l => {
      const d = new Date(l.time);
      const dateStr = d.toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
      const timeStr = d.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      const actionLabel = ACTION_BADGES[l.action] || l.action;
      const detailText = l.detail ? esc(l.detail) : '<span style="color:var(--text3)">—</span>';
      return `<tr>
        <td><strong>${esc(l.username)}</strong></td>
        <td>${actionLabel}</td>
        <td style="max-width:340px;white-space:normal;line-height:1.5">${detailText}</td>
        <td style="white-space:nowrap">${dateStr} · ${timeStr}</td>
        <td>${esc(l.browser)}</td>
        <td>${esc(l.device)}</td>
      </tr>`;
    }).join('');
  }
}

// Log paneli açıkken her 30 saniyede bir "son aktif" listesini tazele
setInterval(() => {
  if (SESSION && canViewLogs() && document.getElementById('page-activityLogs')?.classList.contains('active')) {
    renderActivityLogs();
  }
}, 30000);

$('clearLogsBtn')?.addEventListener('click', () => {
  if (!canViewLogs()) return;
  if (!confirm('Tüm aktivite logları silinecek. Onaylıyor musunuz?')) return;
  localStorage.removeItem(LOG_KEY);
  renderActivityLogs();
  toast('Loglar temizlendi.');
});

// ════════════════════════════════════════
// USERS
// ════════════════════════════════════════
function renderUsers() {
  const users = db.get(K.users);
  const tbody = $('usersTableBody'), empty = $('usersEmpty');
  if (!users.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = users.map(u => {
    const storeName = u.storeId ? getStoreName(u.storeId) : ((u.role === 'admin' || u.role === 'viewer') ? '—' : t('noData'));
    const isSelf    = u.username === SESSION.username;
    const roleLabel = u.role === 'admin' ? t('roleAdmin') : u.role === 'viewer' ? 'Gözlemci' : t('roleUser');
    return `<tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td><span class="role-badge ${u.role}">${roleLabel}</span></td>
      <td>${esc(storeName)}</td>
      <td><div class="row-actions">
        <button class="action-btn edit" onclick="openEditUser('${u.id}')" title="Düzenle"><i class="fas fa-pen"></i></button>
        ${!isSelf ? `<button class="action-btn delete" onclick="openDeleteItem('user','${u.id}','${esc(u.username)}')" title="Sil"><i class="fas fa-trash"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

$('addUserBtn')?.addEventListener('click', () => {
  $('userId').value = ''; $('uUsername').value = ''; $('uPassword').value = '';
  $('uRole').value  = 'user';
  populateStoreSelect('uStore');
  $('uStoreGroup').style.display = '';
  $('userModalTitle').textContent = t('addUserTitle');
  openModal('userModal');
});

window.openEditUser = function(id) {
  const u = db.get(K.users).find(x => x.id === id); if (!u) return;
  $('userId').value   = u.id;
  $('uUsername').value= u.username;
  $('uPassword').value= u.password;
  $('uRole').value    = u.role;
  populateStoreSelect('uStore', u.storeId || '');
  $('uStoreGroup').style.display = (u.role === 'admin' || u.role === 'viewer') ? 'none' : '';
  $('userModalTitle').textContent = t('editUserTitle');
  openModal('userModal');
};

$('uRole')?.addEventListener('change', function() {
  $('uStoreGroup').style.display = (this.value === 'admin' || this.value === 'viewer') ? 'none' : '';
});

$('userForm').addEventListener('submit', e => {
  e.preventDefault();
  clrErr('uUsernameErr','uPasswordErr','uStoreErr');
  const uname   = $('uUsername').value.trim();
  const pass    = $('uPassword').value;
  const role    = $('uRole').value;
  const storeId = $('uStore').value;
  const id      = $('userId').value;
  let ok = true;
  if (!uname) { setErr('uUsernameErr', t('userNameRequired')); ok = false; }
  if (!pass)  { setErr('uPasswordErr', t('userPassRequired')); ok = false; }
  if (role === 'user' && !storeId) { setErr('uStoreErr', t('userStoreRequired')); ok = false; }
  if (!ok) return;

  const users = db.get(K.users);
  if (!id && users.find(u => u.username === uname)) { setErr('uUsernameErr', t('userNameExists')); return; }
  const data = { username: uname, password: pass, role, storeId: (role === 'admin' || role === 'viewer') ? null : storeId };
  const roleLabel = role === 'admin' ? 'Admin' : role === 'viewer' ? 'Gözlemci' : 'Kullanıcı';
  if (id) {
    const idx = users.findIndex(u => u.id === id);
    users[idx] = { ...users[idx], ...data };
    db.set(K.users, users);
    addLog(SESSION.username, 'update', `"${uname}" kullanıcısını düzenledi (rol: ${roleLabel})`);
    toast(t('userEditSuccess', uname));
  } else {
    users.push({ id: uid(), ...data });
    db.set(K.users, users);
    addLog(SESSION.username, 'create', `"${uname}" isimli yeni kullanıcı ekledi (rol: ${roleLabel})`);
    toast(t('userAddSuccess', uname));
  }
  closeModal('userModal'); renderUsers();
});

// ════════════════════════════════════════
// DELETE (UNIVERSAL)
// ════════════════════════════════════════
let pendingDelete = null;

window.openDeleteItem = function(type, id, name) {
  if (!canEdit()) { toast(t('accessDenied'), 'error'); return; }
  pendingDelete = { type, id };
  const titles = { product:'deleteProductTitle', store:'deleteStoreTitle', brand:'deleteBrandTitle', user:'deleteUserTitle' };
  const texts  = { product: t('deleteConfirmText',name), store: t('deleteStoreConfirm',name), brand: t('deleteBrandConfirm',name), user: t('deleteUserConfirm',name) };
  $('deleteModalTitle').textContent = t(titles[type] || 'deleteProductTitle');
  $('deleteModalText').innerHTML    = texts[type] || '';
  openModal('deleteModal');
};

$('deleteConfirmBtn').addEventListener('click', () => {
  if (!canEdit()) { toast(t('accessDenied'), 'error'); closeModal('deleteModal'); return; }
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  if (type === 'product') {
    const p = db.get(K.products).find(x => x.id === id);
    if (p) addLog(SESSION.username, 'delete', `"${getStoreName(p.storeId)}" mağazasındaki "${getCatName(p.categoryId)}" kategorisinden "${p.name}" ürününü sildi`);
    db.set(K.products, db.get(K.products).filter(p => p.id !== id));
    renderProductList(); renderDashboard(); toast(t('deleteSuccess', ''));
  } else if (type === 'store') {
    const s = db.get(K.stores).find(x => x.id === id);
    const affectedCount = db.get(K.products).filter(p => p.storeId === id).length;
    if (s) addLog(SESSION.username, 'delete', `"${s.name}" mağazasını sildi (içindeki ${affectedCount} ürün de silindi)`);
    db.set(K.products, db.get(K.products).filter(p => p.storeId !== id));
    db.set(K.stores,   db.get(K.stores).filter(s => s.id !== id));
    renderStores(); renderDashboard(); toast(t('storeDeleteSuccess', ''));
  } else if (type === 'brand') {
    const b = db.get(K.brands).find(x => x.id === id);
    if (db.get(K.products).some(p => p.brandId === id)) { toast(t('brandDeleteInUse', b?.name||''), 'error'); closeModal('deleteModal'); return; }
    if (b) addLog(SESSION.username, 'delete', `"${getCatName(b.categoryId)}" kategorisindeki "${b.name}" markasını sildi`);
    db.set(K.brands, db.get(K.brands).filter(x => x.id !== id));
    renderBrands(); toast(t('brandDeleteSuccess', b?.name||''));
  } else if (type === 'user') {
    const u = db.get(K.users).find(x => x.id === id);
    if (u?.username === SESSION.username) { toast(t('userDeleteSelf'), 'error'); closeModal('deleteModal'); return; }
    if (u) addLog(SESSION.username, 'delete', `"${u.username}" kullanıcısını sildi (rol: ${u.role === 'admin' ? 'Admin' : u.role === 'viewer' ? 'Gözlemci' : 'Kullanıcı'})`);
    db.set(K.users, db.get(K.users).filter(x => x.id !== id));
    renderUsers(); toast(t('userDeleteSuccess', u?.username||''));
  }
  pendingDelete = null;
  closeModal('deleteModal');
});

// ════════════════════════════════════════
// GÖÇ ARACI: Eski base64 görselleri ImgBB'ye taşı
// (Tek seferlik — her görsel taşındıktan sonra bir daha denenmez)
// ════════════════════════════════════════
function migrateBase64ImagesToImgBB() {
  const isBase64 = (s) => typeof s === 'string' && s.startsWith('data:image');

  function uploadOne(dataUrl) {
    return new Promise((resolve) => {
      const base64Only = dataUrl.split(',')[1];
      const formData = new FormData();
      formData.append('image', base64Only);
      fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData })
        .then(res => res.json())
        .then(json => resolve(json && json.success ? json.data.url : null))
        .catch(() => resolve(null));
    });
  }

  async function migrateList(key) {
    const items = db.get(key);
    let changed = false;
    for (const item of items) {
      if (isBase64(item.image)) {
        const url = await uploadOne(item.image);
        if (url) { item.image = url; changed = true; }
      }
      if (isBase64(item.logo)) {
        const url = await uploadOne(item.logo);
        if (url) { item.logo = url; changed = true; }
      }
    }
    if (changed) db.set(key, items);
  }

  async function migrateNotes() {
    const notes = db.get(K.notes);
    let changed = false;
    for (const n of notes) {
      if (isBase64(n.image)) {
        const url = await uploadOne(n.image);
        if (url) { n.image = url; changed = true; }
      }
    }
    if (changed) db.set(K.notes, notes);
  }

  async function migrateSettings() {
    const s = db.getObj(K.settings, {});
    if (isBase64(s.logo)) {
      const url = await uploadOne(s.logo);
      if (url) { s.logo = url; db.set(K.settings, s); applySettings(); }
    }
  }

  Promise.all([
    migrateList(K.products),
    migrateList(K.stores),
    migrateList(K.brands),
    migrateNotes(),
    migrateSettings(),
  ]).then(() => {
    console.log('[Göç] Base64 görsel taşıma işlemi tamamlandı.');
  });
}

// ════════════════════════════════════════
// START
// ════════════════════════════════════════
init();
// NOT: migrateBase64ImagesToImgBB() artık otomatik çalışmıyor.
// Göç işlemi tek seferlik tamamlandı (görseller zaten ImgBB linkleri).
// Her açılışta tüm ürünleri taramak gereksiz yere zaman/CPU harcıyordu.
// Gerekirse Console'dan elle çalıştırılabilir: migrateBase64ImagesToImgBB()

// SON ÇARE GÜVENLİK AĞI: Her ihtimale karşı, 8 saniye sonra giriş
// butonu hâlâ kilitliyse zorla aç. Hiçbir koşulda kullanıcı sonsuza
// dek "Giriş Yap" butonuna basamadan kalmasın.
setTimeout(() => {
  const btn = $('loginBtn');
  if (btn && btn.disabled) {
    console.warn('[Güvenlik Ağı] Giriş butonu zorla aktif edildi.');
    btn.disabled = false;
    btn.classList.add('ready');
    const waitMsg = $('loginWaitMsg');
    if (waitMsg) waitMsg.style.display = 'none';
    const overlay = $('firebaseLoadingOverlay');
    if (overlay) overlay.remove();
  }
}, 8000);
