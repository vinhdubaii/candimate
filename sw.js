/* Candimate — Service Worker tối giản
   Mục đích: đủ điều kiện PWA + cache app-shell để mở lại nhanh hơn / có mạng chập chờn vẫn dùng được.
   KHÔNG cache ảnh/dữ liệu album — luôn lấy bản mới nhất khi có mạng. */

const CACHE_NAME = 'candimate-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isAppShell = url.origin === self.location.origin &&
    APP_SHELL.some((p) => url.pathname === p);

  if (isAppShell) {
    // Cache-first cho app shell (HTML/CSS/JS/icon) — mở lại tức thì, tự cập nhật ngầm.
    e.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((res) => {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Mọi request khác (ảnh, data JSON, ảnh nền,...) — luôn ưu tiên mạng, không cache
  // để tránh hiển thị ảnh cũ/thiếu khi album có ảnh mới.
});
