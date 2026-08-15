/* ════════════════════════════════════
   CANDIMATE — app.js
   ════════════════════════════════════ */

/* ── CONFIG ── */
const BASE_URL    = '';   // Cloudflare Pages — path tương đối
const WORKER_URL  = 'https://candimate.pages.dev/ai'; // _worker.js endpoint

/* ── HELPERS ── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
function albumFileToId(file) {
  return 'album-' + file.replace('.json', '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

/* ── WALLPAPERS (đọc từ themes/manifest.json) ── */
let WALLPAPERS = [];
async function initWallpaper() {
  try {
    WALLPAPERS = await fetch(`${BASE_URL}/themes/manifest.json`).then(r => r.json());
    if (!Array.isArray(WALLPAPERS)) WALLPAPERS = [];
  } catch { WALLPAPERS = []; }
  applyWallpaper();
  buildWallpaperPicker();
}
function applyWallpaper() {
  if (!WALLPAPERS.length) return; // chưa có ảnh nào trong themes/ — giữ nền mặc định CSS
  const chosen = localStorage.getItem('wallpaperChoice'); // null/'' = random
  let url;
  if (chosen && WALLPAPERS.includes(chosen)) url = chosen;
  else url = WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)];
  document.body.style.backgroundImage = `url('${BASE_URL}/themes/${url}')`;
}
function buildWallpaperPicker() {
  const grid = $('wallpaper-grid'); if (!grid) return;
  grid.innerHTML = '';
  if (!WALLPAPERS.length) { grid.innerHTML = '<p style="font-size:11px;color:var(--muted);grid-column:1/-1;">Chưa có ảnh nền nào trong themes/</p>'; return; }
  const chosen = localStorage.getItem('wallpaperChoice') || '';

  const randomItem = document.createElement('div');
  randomItem.className = 'wallpaper-item random-item' + (chosen === '' ? ' active' : '');
  randomItem.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>Ngẫu nhiên';
  randomItem.addEventListener('click', () => { localStorage.removeItem('wallpaperChoice'); applyWallpaper(); buildWallpaperPicker(); });
  grid.appendChild(randomItem);

  WALLPAPERS.forEach(file => {
    const item = document.createElement('div');
    item.className = 'wallpaper-item' + (chosen === file ? ' active' : '');
    const img = document.createElement('img');
    img.src = `${BASE_URL}/themes/${file}`; img.loading = 'lazy';
    item.appendChild(img);
    item.addEventListener('click', () => { localStorage.setItem('wallpaperChoice', file); applyWallpaper(); buildWallpaperPicker(); });
    grid.appendChild(item);
  });
}
initWallpaper();

/* ── STATE ── */
let YEARS       = [];    // e.g. ["2026"]
let currentYear = null;  // e.g. "2026"
let ALBUMS      = [];    // metadata từ /data/2026/index.json
let albumData   = {};    // { albumId: [photos] }
let allPhotos   = [];    // toàn bộ ảnh của năm hiện tại, đã shuffle
let filtered    = [];    // context cho lightbox: [{ p, albumId, albumMeta }]
let currentIdx  = 0;

/* ══════════════════════════════════════
   DATA LOADING
══════════════════════════════════════ */
function extractPhotos(data) {
  if (!data) return [];
  if (Array.isArray(data) && data[0]?.photos) return data[0].photos;
  if (!Array.isArray(data) && data.photos)    return data.photos;
  if (Array.isArray(data))                     return data;
  return [];
}

async function loadData() {
  // 1. Fetch /data/index.json — biết có những năm nào
  try {
    YEARS = await fetch(`${BASE_URL}/data/index.json`).then(r => r.json());
  } catch {
    YEARS = ['2026'];
  }
  currentYear = YEARS[YEARS.length - 1]; // phần tử cuối = năm mới nhất

  // 2. Fetch /data/{year}/index.json — danh sách album + metadata
  try {
    ALBUMS = await fetch(`${BASE_URL}/data/${currentYear}/index.json`).then(r => r.json());
  } catch {
    ALBUMS = [];
  }

  // 3. Fetch tất cả file JSON album của năm hiện tại
  await Promise.all(
    ALBUMS.map(album => {
      const id = albumFileToId(album.file);
      return fetch(`${BASE_URL}/data/${currentYear}/albums/${album.file}`)
        .then(r => r.json())
        .then(d => { albumData[id] = extractPhotos(d); })
        .catch(() => { albumData[id] = []; });
    })
  );

  // 4. Gộp và shuffle toàn bộ ảnh cho Home
  buildAllPhotos();

  // 5. Render
  buildHomeGallery();
  buildSuggestions();
  buildSettingsAlbumList();
}

function buildAllPhotos() {
  const flat = ALBUMS.flatMap(album => {
    const id = albumFileToId(album.file);
    return (albumData[id] || []).map(p => ({ p, albumId: id, albumMeta: album }));
  });
  // Fisher-Yates shuffle
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }
  allPhotos = flat;
}

loadData();

/* ══════════════════════════════════════
   SETTINGS ALBUM LIST
══════════════════════════════════════ */
function buildSettingsAlbumList() {
  const list = $('settings-album-list');
  if (!list) return;
  list.innerHTML = '';
  ALBUMS.forEach(album => {
    const id     = albumFileToId(album.file);
    const photos = albumData[id] || [];
    const item   = document.createElement('div');
    item.className = 'settings-album-item';
    const titleEl = document.createElement('span');
    titleEl.textContent = `${album.emoji} ${album.title}`;
    const countEl = document.createElement('span');
    countEl.className = 'settings-album-count';
    countEl.textContent = `${photos.length} ảnh`;
    item.appendChild(titleEl);
    item.appendChild(countEl);
    item.addEventListener('click', () => { closeSettings(); openAlbumView(album); });
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════
   GALLERY — IntersectionObserver lazy load
══════════════════════════════════════ */
const cardObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target.querySelector('img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    obs.unobserve(entry.target);
  });
}, { rootMargin: '200px' });

/* ── Đo tỉ lệ ảnh trước khi hiện, cache localStorage để tránh giật layout ── */
const AR_CACHE_KEY = 'arCache';
let arCache = {};
try { arCache = JSON.parse(localStorage.getItem(AR_CACHE_KEY) || '{}'); } catch { arCache = {}; }
let arCacheDirty = false;
function saveArCacheDebounced() {
  if (arCacheDirty) return;
  arCacheDirty = true;
  setTimeout(() => { try { localStorage.setItem(AR_CACHE_KEY, JSON.stringify(arCache)); } catch {} arCacheDirty = false; }, 400);
}
function getOrMeasureRatio(url, cb) {
  if (arCache[url]) { cb(arCache[url]); return; }
  const probe = new Image();
  probe.onload = () => {
    const w = probe.naturalWidth || 4, h = probe.naturalHeight || 5;
    arCache[url] = { w, h };
    saveArCacheDebounced();
    cb(arCache[url]);
  };
  probe.onerror = () => cb({ w: 4, h: 5 }); // fallback tỉ lệ mặc định
  probe.src = url;
}

function makeCard(p, i, onClickFn) {
  const card = document.createElement('div');
  card.className = 'photo-card skeleton';
  card.style.animationDelay = `${Math.min(i * 0.04, 0.6)}s`;
  const eager = i < 12;
  const img = document.createElement('img');
  img.alt = p.name;
  img.loading = 'lazy';
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'photo-name';
  nameSpan.textContent = p.name;
  overlay.appendChild(nameSpan);
  card.appendChild(img);
  card.appendChild(overlay);
  card.addEventListener('click', onClickFn);

  function reveal() {
    card.classList.remove('skeleton');
    if (eager) img.src = p.url; else img.dataset.src = p.url;
    if (!eager) cardObserver.observe(card);
  }

  const cached = arCache[p.url];
  if (cached) {
    card.style.aspectRatio = `${cached.w} / ${cached.h}`;
    reveal();
  } else {
    getOrMeasureRatio(p.url, ({ w, h }) => {
      card.style.aspectRatio = `${w} / ${h}`;
      reveal();
    });
  }
  return card;
}

/* ══════════════════════════════════════
   HOME — ảnh random, không chia album
══════════════════════════════════════ */
function buildHomeGallery() {
  $('sb-home')?.classList.add('active');
  $('sb-albums')?.classList.remove('active');

  const container = $('albums-container');
  if (!container) return;
  container.innerHTML = '';

  if (!allPhotos.length) {
    container.innerHTML = '<p class="empty" style="display:block;color:rgba(255,255,255,.4)">Không có ảnh nào 😔</p>';
    return;
  }

  const gallery = document.createElement('div');
  gallery.className = 'gallery';
  gallery.id = 'home-gallery';

  const frag = document.createDocumentFragment();
  allPhotos.forEach(({ p }, i) => {
    const card = makeCard(p, i, () => {
      filtered   = allPhotos;
      currentIdx = i;
      openLb();
    });
    frag.appendChild(card);
  });
  gallery.appendChild(frag);
  container.appendChild(buildTopSearchBar());
  container.appendChild(gallery);
}

/* ══════════════════════════════════════
   TOP SEARCH BAR — trang chủ
══════════════════════════════════════ */
function buildTopSearchBar() {
  const wrap = document.createElement('div');
  wrap.className = 'top-searchbar-wrap';
  wrap.innerHTML = `
    <div class="top-searchbar">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="top-search-input" placeholder="Tìm ảnh theo tên..." autocomplete="off"/>
    </div>
    <div class="top-searchbar-dropdown" id="top-searchbar-dropdown"></div>`;

  const input    = wrap.querySelector('#top-search-input');
  const dropdown = wrap.querySelector('#top-searchbar-dropdown');

  input.addEventListener('input', debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }

    const qNum = q.replace(/[^0-9]/g, '');
    const hits = getAllPhotosFlat().filter(({ p }) => {
      const name = p.name.toLowerCase();
      if (name.includes(q)) return true;
      if (qNum) {
        const nameNum = name.replace(/[^0-9]/g, '');
        if (nameNum && (parseInt(nameNum,10) === parseInt(qNum,10) || nameNum.includes(qNum))) return true;
      }
      return false;
    }).slice(0, 8);

    dropdown.innerHTML = '';
    if (!hits.length) {
      dropdown.innerHTML = '<div class="tsb-empty">Không tìm thấy 😔</div>';
    } else {
      hits.forEach(({ p, label, albumId, albumMeta }) => {
        const row = document.createElement('div');
        row.className = 'tsb-item';
        row.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span class="tsb-name"></span><span class="tsb-album"></span>`;
        row.querySelector('.tsb-name').textContent  = p.name;
        row.querySelector('.tsb-album').textContent = label;
        row.addEventListener('click', () => {
          const photos = albumData[albumId] || [];
          filtered   = photos.map(ph => ({ p: ph, albumId, albumMeta }));
          currentIdx = photos.indexOf(p);
          dropdown.classList.remove('open');
          openLb();
        });
        dropdown.appendChild(row);
      });
    }
    dropdown.classList.add('open');
  }, 120));

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) dropdown.classList.remove('open');
  });

  return wrap;
}

/* ══════════════════════════════════════
   ALBUMS PAGE — danh sách album
══════════════════════════════════════ */
function openAlbumsPage() {
  $('sb-albums')?.classList.add('active');
  $('sb-home')?.classList.remove('active');

  const container = $('albums-container');
  if (!container) return;
  container.innerHTML = '';

  // Nút chọn năm — chỉ hiện nếu có nhiều hơn 1 năm
  if (YEARS.length > 1) {
    const yearBar = document.createElement('div');
    yearBar.className = 'year-bar';
    YEARS.slice().reverse().forEach(yr => {
      const btn = document.createElement('button');
      btn.className = 'year-btn' + (yr === currentYear ? ' active' : '');
      btn.textContent = yr;
      btn.addEventListener('click', () => {
        // Placeholder — xử lý khi có data năm 2027+
      });
      yearBar.appendChild(btn);
    });
    container.appendChild(yearBar);
  }

  // Grid album
  const grid = document.createElement('div');
  grid.className = 'albums-grid';

  ALBUMS.forEach(album => {
    const id     = albumFileToId(album.file);
    const photos = albumData[id] || [];
    const covers = photos.slice(0, 3);

    const card = document.createElement('div');
    card.className = 'album-card';

    const coversDiv = document.createElement('div');
    coversDiv.className = 'album-card-covers';
    covers.forEach(p => {
      const img = document.createElement('img');
      img.src = p.url; img.loading = 'lazy';
      coversDiv.appendChild(img);
    });

    const infoDiv = document.createElement('div');
    infoDiv.className = 'album-card-info';
    const titleDiv = document.createElement('div');
    titleDiv.className = 'album-card-title';
    titleDiv.textContent = `${album.emoji} ${album.title}`;
    const metaDiv = document.createElement('div');
    metaDiv.className = 'album-card-meta';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'album-card-date';
    dateSpan.textContent = album.date;
    const countSpan = document.createElement('span');
    countSpan.className = 'album-card-count';
    countSpan.textContent = `${photos.length} ảnh`;
    metaDiv.appendChild(dateSpan);
    metaDiv.appendChild(countSpan);
    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(metaDiv);

    card.appendChild(coversDiv);
    card.appendChild(infoDiv);
    card.addEventListener('click', () => openAlbumView(album));
    grid.appendChild(card);
  });

  container.appendChild(grid);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════
   ALBUM DETAIL VIEW — ảnh của 1 album
══════════════════════════════════════ */
function openAlbumView(albumMeta) {
  const id     = albumFileToId(albumMeta.file);
  const photos = albumData[id] || [];
  const container = $('albums-container');
  if (!container) return;
  container.innerHTML = '';

  // Header với nút back
  const header = document.createElement('div');
  header.className = 'album-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'album-back-btn';
  backBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg> Albums`;
  backBtn.addEventListener('click', openAlbumsPage);

  const infoDiv = document.createElement('div');
  infoDiv.className = 'album-info';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'album-title';
  titleDiv.textContent = `${albumMeta.emoji} ${albumMeta.title}`;
  const dateDiv = document.createElement('div');
  dateDiv.className = 'album-date';
  dateDiv.textContent = albumMeta.date;
  infoDiv.appendChild(titleDiv);
  infoDiv.appendChild(dateDiv);

  const countSpan = document.createElement('span');
  countSpan.className = 'album-count';
  countSpan.textContent = `${photos.length} ảnh`;

  header.appendChild(backBtn);
  header.appendChild(infoDiv);
  header.appendChild(countSpan);
  container.appendChild(header);

  const divider = document.createElement('hr');
  divider.className = 'album-divider';
  container.appendChild(divider);

  const gallery = document.createElement('div');
  gallery.className = 'gallery';

  const albumFiltered = photos.map(ph => ({ p: ph, albumId: id, albumMeta }));

  const frag = document.createDocumentFragment();
  photos.forEach((p, i) => {
    const card = makeCard(p, i, () => {
      filtered   = albumFiltered;
      currentIdx = i;
      openLb();
    });
    frag.appendChild(card);
  });
  gallery.appendChild(frag);
  container.appendChild(gallery);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════
   LIGHTBOX + PRELOAD
══════════════════════════════════════ */
const _preloadCache = new Set();

function preloadAround(idx) {
  [-1, 1, 2].forEach(offset => {
    const n   = filtered.length;
    const i   = ((idx + offset) % n + n) % n;
    const item = filtered[i];
    const src  = item?.p?.full || item?.p?.url;
    if (!src || _preloadCache.has(src)) return;
    _preloadCache.add(src);
    new Image().src = src;
  });
}

function openLb()  { updateLb(); $('lightbox').classList.add('active'); document.body.style.overflow = 'hidden'; }
/* ── DOWNLOAD via Blob (bypass cross-origin download restriction) ── */
async function downloadPhoto(url, filename) {
  const btn = $('lb-download');
  if (btn) btn.style.opacity = '.5';
  try {
    const blob = await fetch(url).then(r => r.blob());
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    // Fallback: mở ảnh trong tab mới nếu fetch thất bại
    window.open(url, '_blank');
  } finally {
    if (btn) btn.style.opacity = '';
  }
}

function closeLb() {
  $('lightbox').classList.remove('active');
  document.body.style.overflow = '';
  closeInfoPopup();
}
function navLb(dir) {
  currentIdx = (currentIdx + dir + filtered.length) % filtered.length;
  closeInfoPopup();
  updateLb();
}

function updateLb() {
  const item = filtered[currentIdx]; if (!item) return;
  const { p, albumMeta } = item;
  const el = $('lb-img');
  el.classList.remove('zoomed');

  const zb = $('zoom-btn');
  if (zb) {
    zb.querySelector('svg').innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>';
    zb.childNodes[zb.childNodes.length - 1].textContent = ' Phóng to';
  }

  el.style.animation = 'none'; el.offsetHeight; el.style.animation = 'zoomIn .25s ease';
  el.src = p.full || p.url; el.alt = p.name;
  $('lb-name').textContent    = p.name;
  $('lb-counter').textContent = `${currentIdx + 1} / ${filtered.length}`;

  const dl = $('lb-download');
  const imgUrl  = p.full || p.url;
  const imgName = p.name + '.jpg';
  dl.onclick = (e) => { e.preventDefault(); downloadPhoto(imgUrl, imgName); };

  // Cập nhật popup info nếu đang mở
  if ($('lb-info-popup')?.classList.contains('open')) renderInfoPopup(p, albumMeta);

  preloadAround(currentIdx);
}

/* ── INFO POPUP ── */
function toggleInfoPopup() {
  const popup = $('lb-info-popup'); if (!popup) return;
  const isOpen = popup.classList.toggle('open');
  $('info-btn')?.classList.toggle('active', isOpen);
  if (isOpen) {
    const item = filtered[currentIdx];
    if (item) renderInfoPopup(item.p, item.albumMeta);
  }
}
function closeInfoPopup() {
  $('lb-info-popup')?.classList.remove('open');
  $('info-btn')?.classList.remove('active');
}
function renderInfoPopup(p, albumMeta) {
  const popup = $('lb-info-popup'); if (!popup) return;
  const albumName = albumMeta ? `${albumMeta.emoji} ${albumMeta.title}` : '—';
  popup.innerHTML = `
    <div class="info-row">
      <span class="info-label">Album</span>
      <span class="info-value">${escapeHtml(albumName)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Ảnh</span>
      <span class="info-value">${escapeHtml(p.name)}</span>
    </div>`;
}

/* ── ZOOM ── */
function toggleZoom() {
  const img = $('lb-img'), btn = $('zoom-btn');
  const z = img.classList.toggle('zoomed');
  btn.querySelector('svg').innerHTML = z
    ? '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/>'
    : '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>';
  btn.childNodes[btn.childNodes.length - 1].textContent = z ? ' Thu nhỏ' : ' Phóng to';
}

document.addEventListener('DOMContentLoaded', () => {
  $('lb-img')?.addEventListener('click', e => { e.stopPropagation(); toggleZoom(); });
});
document.addEventListener('keydown', e => {
  if (!$('lightbox')?.classList.contains('active')) return;
  if (e.key === 'Escape')     closeLb();
  if (e.key === 'ArrowLeft')  navLb(-1);
  if (e.key === 'ArrowRight') navLb(1);
});
$('lightbox')?.addEventListener('click', e => { if (e.target === $('lightbox')) closeLb(); });

// Swipe lightbox trên mobile
;(function() {
  const lb = $('lightbox'); if (!lb) return;
  let sx = 0, sy = 0;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = sx - e.changedTouches[0].clientX;
    const dy = Math.abs(e.changedTouches[0].clientY - sy);
    if (Math.abs(dx) > 40 && dy < 80) navLb(dx > 0 ? 1 : -1);
  }, { passive: true });
})();

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
function getAllPhotosFlat() {
  return ALBUMS.flatMap(album => {
    const id = albumFileToId(album.file);
    return (albumData[id] || []).map(p => ({
      p,
      label:     `${album.emoji} ${album.title}`,
      albumId:   id,
      albumMeta: album,
    }));
  });
}

$('sb-search-input')?.addEventListener('input', debounce(function() {
  const q    = $('sb-search-input').value.trim().toLowerCase();
  const res  = $('sb-results'), sugg = $('sb-suggestions');
  if (!q) { res.style.display = 'none'; res.innerHTML = ''; sugg.style.display = 'flex'; return; }
  res.style.display = 'flex'; sugg.style.display = 'none';

  const qNum = q.replace(/[^0-9]/g, '');
  const hits = getAllPhotosFlat().filter(({ p }) => {
    const name = p.name.toLowerCase();
    if (name.includes(q)) return true;
    if (qNum) {
      const nameNum = name.replace(/[^0-9]/g, '');
      if (nameNum && parseInt(nameNum, 10) === parseInt(qNum, 10)) return true;
      if (nameNum.includes(qNum)) return true;
    }
    return false;
  });

  if (!hits.length) { res.innerHTML = '<p class="sb-sr-hint">Không tìm thấy 😔</p>'; return; }
  const frag = document.createDocumentFragment();
  hits.slice(0, 50).forEach(({ p, label, albumId, albumMeta }) => {
    const el = document.createElement('div');
    el.className = 'sb-sr-item';
    const img = document.createElement('img');
    img.src = p.url; img.alt = p.name; img.loading = 'lazy';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'sb-sr-name'; nameDiv.textContent = p.name;
    const albumDiv = document.createElement('div');
    albumDiv.className = 'sb-sr-album'; albumDiv.textContent = label;
    el.appendChild(img); el.appendChild(nameDiv); el.appendChild(albumDiv);
    el.addEventListener('click', () => {
      const photos = albumData[albumId] || [];
      filtered   = photos.map(ph => ({ p: ph, albumId, albumMeta }));
      currentIdx = photos.indexOf(p);
      openLb();
    });
    frag.appendChild(el);
  });
  res.innerHTML = ''; res.appendChild(frag);
}, 100));

/* ══════════════════════════════════════
   DÀNH CHO BẠN — list 1 cột, 10 ảnh lớn
══════════════════════════════════════ */
function buildSuggestions() {
  const list = $('sb-suggest-list');
  if (!list) return;
  const items = getAllPhotosFlat().sort(() => Math.random() - .5).slice(0, 10);
  list.innerHTML = '';

  items.forEach(({ p, label, albumId, albumMeta }) => {
    const item = document.createElement('div');
    item.className = 'sb-suggest-item';
    const img = document.createElement('img');
    img.src = p.url; img.loading = 'lazy';
    const caption = document.createElement('div');
    caption.className = 'sb-suggest-caption';
    const albumEl = document.createElement('div');
    albumEl.className = 'sb-suggest-album'; albumEl.textContent = label;
    const nameEl = document.createElement('div');
    nameEl.className = 'sb-suggest-name'; nameEl.textContent = p.name;
    caption.appendChild(albumEl); caption.appendChild(nameEl);
    item.appendChild(img); item.appendChild(caption);
    item.addEventListener('click', () => {
      const photos = albumData[albumId] || [];
      filtered   = photos.map(ph => ({ p: ph, albumId, albumMeta }));
      currentIdx = photos.indexOf(p);
      openLb();
    });
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════
   UNIFIED MODAL SYSTEM — Search / AI / Music
══════════════════════════════════════ */
let panelOpen = false, aiOpenState = false, musicPickerOpen = false, settingsOpen = false;

function _setModal(id, btnId, open) {
  $(id)?.classList.toggle('open', open);
  $(btnId)?.classList.toggle('active', open);
}
function _anyModalOpen() { return panelOpen || aiOpenState || musicPickerOpen; }
function _syncOverlay() { $('modal-overlay')?.classList.toggle('open', _anyModalOpen()); }

function closeAllModals() {
  if (panelOpen)       toggleSbPanel(true);
  if (aiOpenState)      toggleAiPanel(true);
  if (musicPickerOpen)  toggleMusicPicker(true);
}

function toggleSbPanel(forceClose) {
  panelOpen = forceClose ? false : !panelOpen;
  _setModal('sb-panel', 'sb-search', panelOpen);
  if (panelOpen) {
    if (aiOpenState)     { aiOpenState = false; _setModal('ai-panel', 'sb-ai', false); }
    if (musicPickerOpen) { musicPickerOpen = false; _setModal('music-picker', 'music-btn', false); }
    if (window.innerWidth > 768) setTimeout(() => $('sb-search-input')?.focus(), 260);
    buildSuggestions();
    closeSettings();
  }
  _syncOverlay();
}

function toggleAiPanel(forceClose) {
  aiOpenState = forceClose ? false : !aiOpenState;
  _setModal('ai-panel', 'sb-ai', aiOpenState);
  if (aiOpenState) {
    if (panelOpen)        { panelOpen = false; _setModal('sb-panel', 'sb-search', false); }
    if (musicPickerOpen)  { musicPickerOpen = false; _setModal('music-picker', 'music-btn', false); }
    closeSettings();
    setTimeout(() => $('ai-input')?.focus(), 260);
  }
  _syncOverlay();
}

function toggleMusicPicker(forceClose) {
  musicPickerOpen = forceClose ? false : !musicPickerOpen;
  _setModal('music-picker', 'music-btn', musicPickerOpen);
  if (musicPickerOpen) {
    if (panelOpen)    { panelOpen = false; _setModal('sb-panel', 'sb-search', false); }
    if (aiOpenState)  { aiOpenState = false; _setModal('ai-panel', 'sb-ai', false); }
    closeSettings();
    syncPickerUI();
  }
  _syncOverlay();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _anyModalOpen()) closeAllModals();
});

/* ══════════════════════════════════════
   SETTINGS DRAWER — mép trái, KHÔNG animation
══════════════════════════════════════ */
function toggleSettings() {
  settingsOpen = !settingsOpen;
  $('settings-popup').classList.toggle('open', settingsOpen);
  $('sb-settings').classList.toggle('active', settingsOpen);
  if (settingsOpen) closeAllModals();
}
function closeSettings() {
  settingsOpen = false;
  $('settings-popup')?.classList.remove('open');
  $('sb-settings')?.classList.remove('active');
}
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  buildHomeGallery();
}

document.addEventListener('click', e => {
  const popup = $('settings-popup'), settBtn = $('sb-settings');
  if (settingsOpen && !popup?.contains(e.target) && !settBtn?.contains(e.target)) closeSettings();
});

/* ══════════════════════════════════════
   AUTO-HIDE SIDEBAR (desktop only)
══════════════════════════════════════ */
let autoHideEnabled = localStorage.getItem('autoHideSidebar') === 'on';
let sidebarRevealTimer = null;

function setAutoHideSidebar(enabled) {
  autoHideEnabled = enabled;
  localStorage.setItem('autoHideSidebar', enabled ? 'on' : 'off');
  applyAutoHideState();
}
function applyAutoHideState() {
  const sb = $('sidebar'); if (!sb) return;
  const isMobile = window.innerWidth <= 768;
  if (autoHideEnabled && !isMobile) {
    sb.classList.add('autohide');
    sb.classList.remove('revealed');
  } else {
    sb.classList.remove('autohide', 'revealed');
  }
}
function revealSidebar() {
  $('sidebar')?.classList.add('revealed');
  clearTimeout(sidebarRevealTimer);
}
function scheduleHideSidebar() {
  clearTimeout(sidebarRevealTimer);
  sidebarRevealTimer = setTimeout(() => { $('sidebar')?.classList.remove('revealed'); }, 400);
}
$('sidebar-edge-trigger')?.addEventListener('mouseenter', () => { if (autoHideEnabled) revealSidebar(); });
$('sidebar')?.addEventListener('mouseenter', () => { if (autoHideEnabled) revealSidebar(); });
$('sidebar')?.addEventListener('mouseleave', () => { if (autoHideEnabled) scheduleHideSidebar(); });
window.addEventListener('resize', debounce(applyAutoHideState, 200));
(function initAutoHideToggleUI() {
  const t = $('autohide-toggle'); if (t) t.checked = autoHideEnabled;
  applyAutoHideState();
})();

/* ══════════════════════════════════════
   THEME & SETTINGS
══════════════════════════════════════ */
function applyTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  const t = $('dark-toggle'); if (t) t.checked = isDark;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const logo = $('sb-logo-img');
  if (logo) logo.src = isDark ? '/darkmode-icon.png' : '/lightmode-icon.png';
}
(function() { applyTheme(localStorage.getItem('theme') === 'dark'); })();

function setAutoplay(e) { localStorage.setItem('autoplay', e ? 'on' : 'off'); }
function setSidebarRight(e) { document.body.classList.toggle('sidebar-right', e); localStorage.setItem('sidebarRight', e ? 'on' : 'off'); }
(function() {
  const t  = $('autoplay-toggle'); if (t) t.checked = localStorage.getItem('autoplay') !== 'off';
  const sr = localStorage.getItem('sidebarRight') === 'on';
  if (sr) document.body.classList.add('sidebar-right');
  const rt = $('rightsb-toggle'); if (rt) rt.checked = sr;
})();

/* ══════════════════════════════════════
   MUSIC PLAYER
══════════════════════════════════════ */
const TRACKS = [
  { src: 'https://res.cloudinary.com/dlrax6e5x/video/upload/v1777554981/pdheicppbdxl8t2lryyn.mp3' },
  { src: 'https://res.cloudinary.com/dlrax6e5x/video/upload/v1774274445/ypnxtx3d0yio7tgkbuai.mp3' },
  { src: 'https://res.cloudinary.com/dlrax6e5x/video/upload/v1774274730/kmwdpqkvfncgwqeuusps.mp3' },
];
let trackIdx = parseInt(localStorage.getItem('trackIdx') || '0');
let repeatMode = localStorage.getItem('repeatMode') || 'all';
let audioStarted = false, autoplayEnabled = localStorage.getItem('autoplay') !== 'off';
const audio = $('bg-audio'), musicBtn = $('music-btn');

function loadTrack(idx, play) {
  trackIdx = idx; localStorage.setItem('trackIdx', idx);
  audio.src = TRACKS[idx].src; audio.load(); audio.loop = repeatMode === 'one';
  if (play) audio.play().then(syncMusicUI).catch(() => {});
  syncPickerUI();
}
function syncMusicUI() {
  const p = audio.paused; musicBtn.classList.toggle('playing', !p);
  $('icon-play').style.display = p ? '' : 'none'; $('icon-pause').style.display = p ? 'none' : '';
  const mpp = $('mp-icon-play'), mpz = $('mp-icon-pause');
  if (mpp) mpp.style.display = p ? '' : 'none';
  if (mpz) mpz.style.display = p ? 'none' : '';
  syncPickerUI();
}
function syncPickerUI() {
  TRACKS.forEach((_, i) => { const el = $(`track-${i}`); if (!el) return; el.classList.toggle('active', i === trackIdx); el.classList.toggle('paused', audio.paused); });
  $('repeat-all-btn')?.classList.toggle('active', repeatMode === 'all');
  $('repeat-one-btn')?.classList.toggle('active', repeatMode === 'one');
}
audio.addEventListener('ended', () => { if (repeatMode === 'all') loadTrack((trackIdx + 1) % TRACKS.length, true); });

function selectTrack(idx) { loadTrack(idx, !audio.paused || audioStarted); }
function toggleMusic() {
  if (!audio.src || audio.src === location.href) loadTrack(trackIdx, false);
  if (audio.paused) { audio.play().then(syncMusicUI).catch(() => {}); audioStarted = true; }
  else { audio.pause(); syncMusicUI(); }
}
function setRepeatMode(m) { repeatMode = repeatMode === m ? 'none' : m; localStorage.setItem('repeatMode', repeatMode); audio.loop = repeatMode === 'one'; syncPickerUI(); }

function startOnFirst() {
  if (audioStarted || !autoplayEnabled) return; audioStarted = true;
  if (!audio.src || audio.src === location.href) loadTrack(trackIdx, true);
  else audio.play().then(syncMusicUI).catch(() => {});
  document.removeEventListener('click', startOnFirst); document.removeEventListener('touchstart', startOnFirst);
}
document.addEventListener('click', startOnFirst); document.addEventListener('touchstart', startOnFirst);
audio.src = TRACKS[trackIdx].src; audio.loop = repeatMode === 'one'; syncPickerUI();

/* ══════════════════════════════════════
   AI PANEL — biến trạng thái chat
══════════════════════════════════════ */
let aiHistory = [];   // [{ role: 'user'|'bot', text }]
let aiLoading = false;

/* ── Build metadata gửi lên Worker ── */
function buildMetadata() {
  return ALBUMS.map(album => {
    const id     = albumFileToId(album.file);
    const photos = (albumData[id] || []).map(p => p.name);
    return {
      albumId:   id,
      title:     album.title,
      emoji:     album.emoji,
      date:      album.date,
      photoCount: photos.length,
      photos,
    };
  });
}

/* ── Render tin nhắn ── */
function appendMsg(role, content) {
  const msgs  = $('ai-messages'); if (!msgs) return;
  const wrap  = document.createElement('div');
  wrap.className = `ai-msg ai-msg--${role}`;

  if (typeof content === 'string') {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    bubble.textContent = content;
    wrap.appendChild(bubble);
  } else {
    // content là DOM node (ví dụ grid ảnh)
    wrap.appendChild(content);
  }

  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function showTyping() {
  const msgs  = $('ai-messages'); if (!msgs) return null;
  const wrap  = document.createElement('div');
  wrap.className = 'ai-msg ai-msg--bot ai-typing';
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  [0,1,2].forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'ai-typing-dot';
    bubble.appendChild(dot);
  });
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

/* ── Render kết quả ảnh ── */
function renderPhotoResults(results) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg-bubble';

  if (!results || !results.length) {
    wrap.textContent = 'Mình không tìm thấy ảnh phù hợp. Bạn thử mô tả khác nhé! 😊';
    return wrap;
  }

  const label = document.createElement('div');
  label.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:8px;';
  label.textContent   = `Tìm thấy ${results.length} ảnh phù hợp:`;
  wrap.appendChild(label);

  const grid = document.createElement('div');
  grid.className = 'ai-photo-grid';

  results.forEach(({ albumId, photoName }) => {
    const photos    = albumData[albumId] || [];
    const albumMeta = ALBUMS.find(a => albumFileToId(a.file) === albumId);
    const photo     = photos.find(p => p.name === photoName) || photos[0];
    if (!photo) return;

    const img = document.createElement('img');
    img.src   = photo.url; img.loading = 'lazy';
    img.title = photo.name;
    img.addEventListener('click', () => {
      const albumFiltered = photos.map(p => ({ p, albumId, albumMeta }));
      filtered   = albumFiltered;
      currentIdx = photos.indexOf(photo);
      openLb();
    });
    grid.appendChild(img);
  });

  wrap.appendChild(grid);
  return wrap;
}

/* ── Gửi message ── */
async function sendAiMessage() {
  const input = $('ai-input'); if (!input) return;
  const query = input.value.trim();
  if (!query || aiLoading) return;

  // Hiện tin nhắn user
  appendMsg('user', query);
  aiHistory.push({ role: 'user', text: query });
  input.value = '';
  $('ai-send').disabled = true;
  aiLoading = true;

  // Typing indicator
  const typingEl = showTyping();

  try {
    const res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        metadata: buildMetadata(),
        history:  aiHistory.slice(-6),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    typingEl?.remove();

    if (data.type === 'search') {
      const node = renderPhotoResults(data.results);
      const msgWrap = document.createElement('div');
      msgWrap.className = 'ai-msg ai-msg--bot';
      msgWrap.appendChild(node);
      $('ai-messages').appendChild(msgWrap);
      $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
      aiHistory.push({ role: 'bot', text: `[Kết quả tìm kiếm: ${data.results?.length || 0} ảnh]` });
    } else {
      const text = data.text || 'Xin lỗi, mình không hiểu câu hỏi này. Bạn thử hỏi lại nhé!';
      appendMsg('bot', text);
      aiHistory.push({ role: 'bot', text });
    }

  } catch (err) {
    typingEl?.remove();
    appendMsg('bot', 'Rất tiếc, có lỗi xảy ra. Vui lòng thử lại sau! 😔');
  }

  $('ai-send').disabled = false;
  aiLoading = false;
  input.focus();
}

/* ── Gửi bằng Enter ── */
$('ai-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
});

/* ── Đóng khi nhấn Escape: đã xử lý chung trong Unified Modal System ── */

/* ── Mobile: kéo để đóng bottom sheet ── */
;(function initAiSwipe() {
  const panel  = $('ai-panel'); if (!panel) return;
  let startY   = 0, isDragging = false;
  const handle = $('ai-drag-handle');

  function onStart(y) { startY = y; isDragging = true; }
  function onEnd(y)   {
    if (!isDragging) return; isDragging = false;
    if (y - startY > 80) toggleAiPanel(); // kéo xuống 80px → đóng
  }

  handle?.addEventListener('touchstart', e => onStart(e.touches[0].clientY),      { passive: true });
  handle?.addEventListener('touchend',   e => onEnd(e.changedTouches[0].clientY),  { passive: true });
  handle?.addEventListener('mousedown',  e => onStart(e.clientY));
  window.addEventListener('mouseup',     e => { if (isDragging) onEnd(e.clientY); });
})();
