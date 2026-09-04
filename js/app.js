/* ════════════════════════════════════
   CANDIMATE — app.js
   ════════════════════════════════════ */

/* ── CONFIG ── */
const BASE_URL    = '';   // Cloudflare Pages — path tương đối

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
  if (localStorage.getItem('perfSaver') === 'on') return; // Tiết kiệm hiệu năng: không tải ảnh nền
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
        row.innerHTML = `<img class="tsb-thumb" alt=""><span class="tsb-name"></span><span class="tsb-album"></span>`;
        const thumb = row.querySelector('.tsb-thumb');
        thumb.src = p.url; thumb.loading = 'lazy';
        // Set trực tiếp qua inline style — không phụ thuộc CSS cache, luôn đảm bảo thumbnail nhỏ gọn
        thumb.style.cssText = 'width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0;display:block;';
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
  $('lightbox')?.classList.remove('zoomed-active');
  panX = 0; panY = 0;
  el.style.transform = '';

  const zb = $('zoom-btn');
  if (zb) {
    zb.querySelector('svg').innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>';
    zb.childNodes[zb.childNodes.length - 1].textContent = ' Phóng to';
  }

  el.style.animation = 'none'; el.offsetHeight; el.style.animation = 'zoomIn .25s ease';
  el.src = p.full || p.url; el.alt = p.name;
  $('lb-name').textContent    = p.name;
  $('lb-counter').textContent = `${currentIdx + 1} / ${filtered.length}`;
  syncFavBtn(p.url);

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

/* ── ZOOM + PAN ── */
const ZOOM_SCALE = 3;
let panX = 0, panY = 0;

function applyZoomTransform() {
  const img = $('lb-img');
  img.style.transform = img.classList.contains('zoomed')
    ? `translate(${panX}px, ${panY}px) scale(${ZOOM_SCALE})`
    : '';
}

function toggleZoom() {
  const img = $('lb-img'), btn = $('zoom-btn');
  const z = img.classList.toggle('zoomed');
  $('lightbox')?.classList.toggle('zoomed-active', z);
  panX = 0; panY = 0;
  applyZoomTransform();
  btn.querySelector('svg').innerHTML = z
    ? '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/>'
    : '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>';
  btn.childNodes[btn.childNodes.length - 1].textContent = z ? ' Thu nhỏ' : ' Phóng to';
}

/* Kéo ảnh (pan) khi đang zoom — chuột và cảm ứng đều dùng chung logic này.
   Nhấn nhẹ (không kéo) → toggle zoom; kéo đủ xa → pan xem góc khác, có giới hạn (clamp). */
;(function initLbPan() {
  const img = $('lb-img'); if (!img) return;
  const DRAG_THRESHOLD = 6;
  let isPanning = false, panMoved = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  function getMaxPan() {
    return {
      maxX: (img.offsetWidth  * (ZOOM_SCALE - 1)) / 2,
      maxY: (img.offsetHeight * (ZOOM_SCALE - 1)) / 2,
    };
  }
  const clamp = (v, max) => Math.min(max, Math.max(-max, v));

  function onDown(x, y) {
    isPanning = true; panMoved = false;
    startX = x; startY = y;
    startPanX = panX; startPanY = panY;
    if (img.classList.contains('zoomed')) img.classList.add('panning');
  }
  function onMove(x, y) {
    if (!isPanning) return;
    const dx = x - startX, dy = y - startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) panMoved = true;
    if (!panMoved || !img.classList.contains('zoomed')) return;
    const { maxX, maxY } = getMaxPan();
    panX = clamp(startPanX + dx, maxX);
    panY = clamp(startPanY + dy, maxY);
    applyZoomTransform();
  }
  function onUp() {
    if (!isPanning) return;
    isPanning = false;
    img.classList.remove('panning');
    if (!panMoved) toggleZoom(); // click nhẹ → toggle zoom (cả 2 chiều: zoom in / thu nhỏ)
  }

  img.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onDown(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onUp);

  img.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    e.preventDefault(); // Ngăn trình duyệt tạo mouse event ảo sau chạm → tránh double-toggle zoom
    onDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  img.addEventListener('touchmove', e => {
    if (!isPanning || e.touches.length !== 1) return;
    if (img.classList.contains('zoomed')) e.preventDefault(); // ngăn cuộn trang khi đang pan
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  img.addEventListener('touchend', onUp);
})();
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
    if ($('lb-img')?.classList.contains('zoomed')) return; // Đang zoom → vuốt là để xem góc ảnh, không đổi ảnh
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

let _searchToken = 0;
$('sb-search-input')?.addEventListener('input', debounce(async function() {
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

  const myToken = ++_searchToken; // gõ nhanh -> bỏ kết quả của lần gọi cũ hơn

  if (!hits.length) { res.innerHTML = '<p class="sb-sr-hint">Không tìm thấy 😔</p>'; return; }

  // Đo tỉ lệ TẤT CẢ ảnh xong rồi mới dựng lưới — giữ đúng tỉ lệ thật, không cắt ảnh
  const withRatio = await Promise.all(hits.slice(0, 50).map(async it => {
    const { w, h } = await getRatioPromise(it.p.url);
    return { ...it, w, h };
  }));

  if (myToken !== _searchToken) return; // đã có lần gõ mới hơn, bỏ kết quả cũ

  const rows = groupIntoRows(withRatio, 3); // 3 ảnh dọc/hàng, ảnh ngang chiếm trọn hàng

  const frag = document.createDocumentFragment();
  rows.forEach(rowItems => {
    const row = document.createElement('div');
    row.className = 'sb-sr-row';
    rowItems.forEach(({ p, label, albumId, albumMeta, w, h }) => {
      const el = document.createElement('div');
      el.className = 'sb-sr-item';
      const img = document.createElement('img');
      img.src = p.url; img.alt = p.name; img.loading = 'lazy';
      img.style.aspectRatio = `${w} / ${h}`; // giữ chỗ đúng tỉ lệ thật trước khi ảnh load
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
      row.appendChild(el);
    });
    frag.appendChild(row);
  });
  res.innerHTML = ''; res.appendChild(frag);
}, 100));

/* ══════════════════════════════════════
   DÀNH CHO BẠN — layout justified: 2 ảnh dọc/hàng, ảnh ngang chiếm hết hàng
══════════════════════════════════════ */
function getRatioPromise(url) {
  return new Promise(resolve => getOrMeasureRatio(url, resolve));
}

/* Nhóm items thành từng hàng kiểu justified: ảnh ngang đứng riêng 1 hàng,
   ảnh dọc gom liên tiếp tối đa `maxPerRow` ảnh/hàng (hàng cuối có thể ít hơn). */
function groupIntoRows(items, maxPerRow) {
  const rows = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    if (cur.w >= cur.h) { rows.push([cur]); i++; continue; }
    const group = [cur];
    let j = i + 1;
    while (group.length < maxPerRow && items[j] && items[j].w < items[j].h) {
      group.push(items[j]); j++;
    }
    rows.push(group);
    i = j;
  }
  return rows;
}

let _suggestToken = 0;
async function buildSuggestions() {
  const list = $('sb-suggest-list');
  if (!list) return;
  const myToken = ++_suggestToken; // tránh 2 lần gọi chồng nhau ghi đè kết quả cũ

  const items = getAllPhotosFlat().sort(() => Math.random() - .5).slice(0, 10);

  // Đo tỉ lệ TẤT CẢ ảnh xong rồi mới dựng lưới — tránh Grid dense reflow chồng chéo
  const withRatio = await Promise.all(items.map(async it => {
    const { w, h } = await getRatioPromise(it.p.url);
    return { ...it, w, h };
  }));

  if (myToken !== _suggestToken) return; // đã có lần gọi mới hơn (VD panel đóng/mở lại nhanh), bỏ kết quả cũ

  // Nhóm items thành từng hàng: 2 ảnh dọc/hàng, ảnh ngang đứng riêng 1 hàng.
  // Làm bằng flex theo hàng (thay vì CSS Grid span-column) để mỗi hàng tự co
  // giãn đúng theo chiều cao thật của nó, không bị lệch/tràn sang hàng khác.
  const rows = groupIntoRows(withRatio, 2);

  list.innerHTML = '';
  rows.forEach(rowItems => {
    const row = document.createElement('div');
    row.className = 'sb-suggest-row';
    rowItems.forEach(({ p, label, albumId, albumMeta, w, h }) => {
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
      row.appendChild(item);
    });
    list.appendChild(row);
  });
}

/* ══════════════════════════════════════
   UNIFIED MODAL SYSTEM — Search / Music
══════════════════════════════════════ */
let panelOpen = false, musicPickerOpen = false, settingsOpen = false, accountOpen = false;

function _setModal(id, btnId, open) {
  $(id)?.classList.toggle('open', open);
  $(btnId)?.classList.toggle('active', open);
}
function _anyModalOpen() { return panelOpen || musicPickerOpen; }
function _syncOverlay() { $('modal-overlay')?.classList.toggle('open', _anyModalOpen()); }

function closeAllModals() {
  if (panelOpen)       toggleSbPanel(true);
  if (musicPickerOpen)  toggleMusicPicker(true);
}

function toggleSbPanel(forceClose) {
  panelOpen = forceClose ? false : !panelOpen;
  _setModal('sb-panel', 'sb-search', panelOpen);
  if (panelOpen) {
    if (musicPickerOpen) { musicPickerOpen = false; _setModal('music-picker', 'music-btn', false); }
    if (window.innerWidth > 768) setTimeout(() => $('sb-search-input')?.focus(), 260);
    buildSuggestions();
    closeSettings();
    closeAccountPanel();
  }
  _syncOverlay();
}

function toggleMusicPicker(forceClose) {
  musicPickerOpen = forceClose ? false : !musicPickerOpen;
  _setModal('music-picker', 'music-btn', musicPickerOpen);
  if (musicPickerOpen) {
    if (panelOpen)    { panelOpen = false; _setModal('sb-panel', 'sb-search', false); }
    closeSettings();
    closeAccountPanel();
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
function _syncPanelBgVisibility() {
  document.body.classList.toggle('panel-open', settingsOpen || accountOpen);
}

function toggleSettings() {
  settingsOpen = !settingsOpen;
  $('settings-popup').classList.toggle('open', settingsOpen);
  if (settingsOpen) {
    closeAllModals();
    closeAccountPanel();
    revealSidebar(); // Settings mở ra thì sidebar PHẢI hiện, không ẩn/không bị đè
  } else {
    if (autoHideEnabled && !$('sidebar')?.matches(':hover')) scheduleHideSidebar();
  }
  _syncPanelBgVisibility();
}
function closeSettings() {
  settingsOpen = false;
  $('settings-popup')?.classList.remove('open');
  _syncPanelBgVisibility();
}

/* ══════════════════════════════════════
   ACCOUNT PANEL — avatar/tên + danh sách đã lưu
══════════════════════════════════════ */
function toggleAccountPanel() {
  accountOpen = !accountOpen;
  $('account-popup').classList.toggle('open', accountOpen);
  $('sb-account')?.classList.toggle('active', accountOpen);
  if (accountOpen) {
    closeAllModals();
    closeSettings();
    revealSidebar();
    renderAccountBookmarks();
  } else {
    if (autoHideEnabled && !$('sidebar')?.matches(':hover')) scheduleHideSidebar();
  }
  _syncPanelBgVisibility();
}
function closeAccountPanel() {
  accountOpen = false;
  $('account-popup')?.classList.remove('open');
  $('sb-account')?.classList.remove('active');
  _syncPanelBgVisibility();
}
// Icon bánh răng trong panel Account -> chuyển sang panel Settings
function switchToSettingsPanel() {
  closeAccountPanel();
  if (!settingsOpen) toggleSettings();
}
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  buildHomeGallery();
}

document.addEventListener('click', e => {
  // Click bên trong lightbox (kể cả nền đen backdrop) không tính là "click ra ngoài" panel —
  // lightbox nổi trên panel nên tương tác trong đó không nên làm đóng panel phía sau.
  if ($('lightbox')?.contains(e.target)) return;

  const popup = $('settings-popup'), gearBtn = $('account-settings-gear');
  if (settingsOpen && !popup?.contains(e.target) && !gearBtn?.contains(e.target)) {
    closeSettings();
    if (autoHideEnabled && !$('sidebar')?.matches(':hover')) scheduleHideSidebar();
  }
  const accPopup = $('account-popup'), accBtn = $('sb-account');
  if (accountOpen && !accPopup?.contains(e.target) && !accBtn?.contains(e.target)) {
    closeAccountPanel();
    if (autoHideEnabled && !$('sidebar')?.matches(':hover')) scheduleHideSidebar();
  }
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
    document.body.classList.add('autohide-collapsed');
  } else {
    sb.classList.remove('autohide', 'revealed');
    document.body.classList.remove('autohide-collapsed');
  }
}
function revealSidebar() {
  $('sidebar')?.classList.add('revealed');
  document.body.classList.remove('autohide-collapsed');
  clearTimeout(sidebarRevealTimer);
}
function scheduleHideSidebar() {
  if (settingsOpen || accountOpen) return; // đang mở Settings/Account thì không được ẩn
  clearTimeout(sidebarRevealTimer);
  sidebarRevealTimer = setTimeout(() => {
    if (settingsOpen || accountOpen) return;
    $('sidebar')?.classList.remove('revealed');
    if (autoHideEnabled) document.body.classList.add('autohide-collapsed');
  }, 400);
}
$('sidebar-edge-trigger')?.addEventListener('mouseenter', () => { if (autoHideEnabled) revealSidebar(); });
$('sidebar-edge-trigger')?.addEventListener('mouseleave', () => { if (autoHideEnabled) scheduleHideSidebar(); });
$('sidebar')?.addEventListener('mouseenter', () => { if (autoHideEnabled) revealSidebar(); });
$('sidebar')?.addEventListener('mouseleave', () => { if (autoHideEnabled) scheduleHideSidebar(); });
window.addEventListener('resize', debounce(applyAutoHideState, 200));
(function initAutoHideToggleUI() {
  const t = $('autohide-toggle'); if (t) t.checked = autoHideEnabled;
  applyAutoHideState();
})();

/* ══════════════════════════════════════
   CHẾ ĐỘ TIẾT KIỆM HIỆU NĂNG
══════════════════════════════════════ */
function setPerfSaver(enabled) {
  localStorage.setItem('perfSaver', enabled ? 'on' : 'off');
  applyPerfSaverState();
}
function applyPerfSaverState() {
  const enabled = localStorage.getItem('perfSaver') === 'on';
  document.body.classList.toggle('perf-saver', enabled);
  $('wallpaper-grid')?.classList.toggle('disabled', enabled);
  if (enabled) {
    document.body.style.backgroundImage = ''; // bỏ ảnh nền đang có, dùng màu phẳng CSS
  } else {
    applyWallpaper(); // bật lại thì tải/áp dụng lại ảnh nền như cũ
  }
}
(function initPerfSaverToggleUI() {
  const enabled = localStorage.getItem('perfSaver') === 'on';
  const t = $('perfsaver-toggle'); if (t) t.checked = enabled;
  applyPerfSaverState();
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
   YÊU THÍCH (Favorites)
══════════════════════════════════════ */
const FAV_KEY = 'favorites'; // { [photoUrl]: timestamp }

function getFavoritesMap() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch { return {}; }
}
function saveFavoritesMap(map) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(map)); } catch {}
}
function isFavorite(url) { return !!getFavoritesMap()[url]; }
function toggleFavorite(url) {
  const map = getFavoritesMap();
  if (map[url]) delete map[url]; else map[url] = Date.now();
  saveFavoritesMap(map);
  return !!map[url];
}
function syncFavBtn(url) {
  $('lb-fav-btn')?.classList.toggle('active', isFavorite(url));
}
function toggleFavoriteCurrentPhoto() {
  const item = filtered[currentIdx]; if (!item) return;
  toggleFavorite(item.p.url);
  syncFavBtn(item.p.url);
  if (accountOpen) renderAccountBookmarks();
}

/* ══════════════════════════════════════
   BOOKMARK TRONG ACCOUNT PANEL — nhóm theo ngày, mới nhất trước
══════════════════════════════════════ */
function renderAccountBookmarks() {
  const container = $('account-fav-list');
  if (!container) return;
  container.innerHTML = '';

  const favMap  = getFavoritesMap();
  const favUrls = Object.keys(favMap);

  if (!favUrls.length) {
    container.innerHTML = `
      <div class="account-fav-empty">
        Chưa có ảnh yêu thích nào. Bấm biểu tượng Bookmark khi xem ảnh để lưu vào đây nhé.
      </div>`;
    return;
  }

  // Ghép dữ liệu ảnh yêu thích + thời điểm thích, sắp mới nhất trước
  const favItems = getAllPhotosFlat()
    .filter(({ p }) => favMap[p.url])
    .map(item => ({ ...item, ts: favMap[item.p.url] }))
    .sort((a, b) => b.ts - a.ts);

  // Nhóm theo ngày (dựa vào thời điểm bấm thích)
  const groups = [];
  const dayIndex = new Map();
  favItems.forEach(item => {
    const d = new Date(item.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dayIndex.has(key)) {
      const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const group = { label, items: [] };
      dayIndex.set(key, group);
      groups.push(group);
    }
    dayIndex.get(key).items.push(item);
  });

  // Danh sách phẳng dùng cho Lightbox — điều hướng prev/next xuyên suốt mọi ngày
  const flatForLb = favItems.map(({ p, albumId, albumMeta }) => ({ p, albumId, albumMeta }));

  const frag = document.createDocumentFragment();
  let globalIdx = 0;
  groups.forEach(group => {
    const heading = document.createElement('div');
    heading.className = 'fav-day-heading';
    heading.textContent = group.label;
    frag.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'account-fav-grid';
    group.items.forEach(item => {
      const idxForThisCard = globalIdx;
      const card = makeCard(item.p, globalIdx, () => {
        filtered   = flatForLb;
        currentIdx = idxForThisCard;
        openLb();
      });
      grid.appendChild(card);
      globalIdx++;
    });
    frag.appendChild(grid);
  });
  container.appendChild(frag);
}

/* ══════════════════════════════════════
   PWA — đăng ký Service Worker (điều kiện để trình duyệt hiện nút "Cài đặt")
══════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
