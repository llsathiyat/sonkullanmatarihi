/* ═══════════════════════════════════════════════════════════
   ExpiryTrack v2 — app.js   (STABLE RESTORE)
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
  if (ov && e.target === ov) closeModal(ov.id);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
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
    if (sess) { try { SESSION = JSON.parse(sess); showApp(); } catch { showLogin(); } }
    else showLogin();
    const overlay = $('firebaseLoadingOverlay');
    if (overlay) overlay.remove();
  };

  // Ne olursa olsun 28 saniye sonra uygulamayı başlat (kesin garanti)
  setTimeout(start, 28000);

  try {
    if (window.__firebaseReady && typeof window.__firebaseReady.then === 'function') {
      window.__firebaseReady.then(start).catch(start);
    } else {
      start();
    }
  } catch (e) {
    console.warn('[init] hata, doğrudan başlatılıyor:', e);
    start();
  }
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
function applySettings() {
  const s = db.getObj(K.settings, { appName: 'ExpiryTrack', tagline: 'Akıllı Son Kullanma Takip Sistemi', logo: '' });
  $('loginAppName').textContent = s.appName;
  $('loginTagline').textContent = s.tagline;
  $('loginLogoWrap').innerHTML  = s.logo
    ? `<img src="${esc(s.logo)}" class="brand-logo-img" alt="logo">`
    : `<div class="brand-icon"><i class="fas fa-box-open"></i></div>`;
  $('sidebarAppName').textContent = s.appName;
  $('sidebarLogoWrap').innerHTML  = s.logo
    ? `<img src="${esc(s.logo)}" class="brand-logo-img sm" alt="logo">`
    : `<div class="brand-icon sm"><i class="fas fa-box-open"></i></div>`;
  document.title = s.appName;
  if ($('settingAppName')) {
    $('settingAppName').value = s.appName;
    $('settingTagline').value = s.tagline;
    if (uploaders['appLogoUploader']) uploaders['appLogoUploader'].setValue(s.logo);
  }
}

$('settingsAppForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const logo = uploaders['appLogoUploader']?.getValue() || '';
  db.set(K.settings, {
    appName:  $('settingAppName').value.trim() || 'ExpiryTrack',
    tagline:  $('settingTagline').value.trim(),
    logo,
  });
  applySettings();
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
    showApp();
  }, 700);
});

$('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('et_session');
  showLogin(); toast(t('logoutSuccess'));
});

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
  categories:   t('pageCategories'),
  stores:       t('pageStores'),
  brands:       t('pageBrands'),
  users:        t('pageUsers'),
  settings:     t('pageSettings'),
  productNotes: 'Ürün Notları',
};
const ADMIN_PAGES  = ['stores', 'brands', 'users', 'settings', 'productNotes'];
const EDITOR_PAGES = ['addProduct']; // viewer bu sayfalara giremez

function navigateTo(pageId) {
  if (ADMIN_PAGES.includes(pageId) && !isAdmin()) { toast(t('accessDenied'), 'error'); return; }
  if (EDITOR_PAGES.includes(pageId) && isViewer()) { toast(t('accessDenied'), 'error'); return; }
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
  $('pageTitle').textContent = PAGE_TITLES[pageId] || pageId;
  closeMobileSidebar();

  if (pageId === 'dashboard')   renderDashboard();
  if (pageId === 'addProduct')  prepareAddProductForm();
  if (pageId === 'productList') renderProductList();
  if (pageId === 'categories')  renderCategories();
  if (pageId === 'stores')      renderStores();
  if (pageId === 'brands')      renderBrands();
  if (pageId === 'users')       renderUsers();
  if (pageId === 'productNotes') renderProductNotes();
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
  populateStoreFilter(); populateCatFilter(); populateBrandFilter();

  let products = visibleProducts();
  if (PF.search) { const q = PF.search.toLowerCase(); products = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||'').includes(q) || getBrandName(p.brandId).toLowerCase().includes(q)); }
  if (PF.storeId) products = products.filter(p => p.storeId  === PF.storeId);
  if (PF.catId)   products = products.filter(p => p.categoryId === PF.catId);
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

  const groups = {};
  products.forEach(p => { if (!groups[p.categoryId]) groups[p.categoryId] = []; groups[p.categoryId].push(p); });

  container.innerHTML = Object.entries(groups).map(([catId, items]) => `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.6px">${esc(getCatName(catId))}</span>
        <span style="background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${items.length}</span>
      </div>
      <div class="section-card"><div class="product-table-wrap">
        <table class="product-table">
          <thead><tr><th></th><th>Ürün</th><th>Mağaza</th><th>Marka</th><th>Barkod</th><th>Adet</th><th>Son Kullanma</th><th>Durum</th><th>İşlemler</th></tr></thead>
          <tbody>${items.map(p => {
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
      </div></div>
    </div>`).join('');
}

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
  products[idx] = { ...products[idx], name,
    storeId:    $('editProdStore').value,
    categoryId: $('editProdCat').value,
    brandId:    $('editProdBrand').value,
    quantity:   +$('editProdQty').value,
    expiry:     $('editProdExpiry').value,
    barcode:    $('editProdBarcode').value.trim(),
    image:      uploaders['editProdImgUploader']?.getValue() ?? (products[idx].image || ''),
    note:       products[idx].note || '',
  };
  db.set(K.products, products);
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
    return `<div class="cat-card" style="animation-delay:${i*0.06}s" onclick="navigateTo('brands');filterBrandsByCat('${cat.id}')">
      <div class="cat-icon-wrap" style="background:${cat.color}22;color:${cat.color}"><i class="fas ${cat.icon}"></i></div>
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
  if (id) { const idx = stores.findIndex(s => s.id === id); stores[idx] = { ...stores[idx], ...data }; db.set(K.stores, stores); toast(t('storeEditSuccess', name)); }
  else    { stores.push({ id: uid(), ...data }); db.set(K.stores, stores); toast(t('storeAddSuccess', name)); }
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
  if (id) { const idx = brands.findIndex(b => b.id === id); brands[idx] = { ...brands[idx], ...data }; db.set(K.brands, brands); toast(t('brandEditSuccess', name)); }
  else    { brands.push({ id: uid(), ...data }); db.set(K.brands, brands); toast(t('brandAddSuccess', name)); }
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
  const notes = db.get(K.notes).filter(n => n.id !== noteId);
  db.set(K.notes, notes);
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

  if (noteId) {
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx !== -1) notes[idx] = { ...notes[idx], ...data };
  } else {
    notes.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
  }

  db.set(K.notes, notes);
  closeModal('editNoteModal');
  renderProductNotes();
  toast(noteId ? 'Not güncellendi.' : 'Not eklendi.');
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
  if (id) { const idx = users.findIndex(u => u.id === id); users[idx] = { ...users[idx], ...data }; db.set(K.users, users); toast(t('userEditSuccess', uname)); }
  else    { users.push({ id: uid(), ...data }); db.set(K.users, users); toast(t('userAddSuccess', uname)); }
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
    db.set(K.products, db.get(K.products).filter(p => p.id !== id));
    renderProductList(); renderDashboard(); toast(t('deleteSuccess', ''));
  } else if (type === 'store') {
    db.set(K.products, db.get(K.products).filter(p => p.storeId !== id));
    db.set(K.stores,   db.get(K.stores).filter(s => s.id !== id));
    renderStores(); renderDashboard(); toast(t('storeDeleteSuccess', ''));
  } else if (type === 'brand') {
    const b = db.get(K.brands).find(x => x.id === id);
    if (db.get(K.products).some(p => p.brandId === id)) { toast(t('brandDeleteInUse', b?.name||''), 'error'); closeModal('deleteModal'); return; }
    db.set(K.brands, db.get(K.brands).filter(x => x.id !== id));
    renderBrands(); toast(t('brandDeleteSuccess', b?.name||''));
  } else if (type === 'user') {
    const u = db.get(K.users).find(x => x.id === id);
    if (u?.username === SESSION.username) { toast(t('userDeleteSelf'), 'error'); closeModal('deleteModal'); return; }
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
setTimeout(migrateBase64ImagesToImgBB, 3000);
