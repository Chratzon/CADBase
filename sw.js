// Service Worker: alle Dateien offline verfügbar (Netz zuerst, Cache als Rückfall)
const CACHE = 'cadbase-v8';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/model.js', 'js/geom.js', 'js/hatch.js', 'js/render.js', 'js/print.js', 'js/export.js', 'js/view3d.js', 'js/tools.js', 'js/gen.js', 'js/drywall.js', 'js/drywall-ui.js', 'js/underlay.js', 'js/vendor/pdfjs/pdf.min.mjs', 'js/vendor/pdfjs/pdf.worker.min.mjs',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
