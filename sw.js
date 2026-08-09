/* Service Worker — TARGET ALL Explorer
   Estratégia: cache-first para o app shell (mesmo domínio) e
   stale-while-revalidate para o Plotly CDN. Os dados de estudo ficam
   em IndexedDB (gerenciado pela aplicação), não aqui. */
const CACHE = 'tall-explorer-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/stats.js',
  './js/dea.js',
  './js/survival.js',
  './js/cox.js',
  './js/cluster.js',
  './js/api.js',
  './js/storage.js',
  './js/datapack.js',
  './js/charts.js',
  './js/export.js',
  './js/ui.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const RUNTIME_CACHE = 'tall-explorer-runtime-v1';
const CDN_PREFIXES = [
  'https://cdn.plot.ly/'
];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  const isCDN = CDN_PREFIXES.some((p) => url.href.startsWith(p));
  const isApi = url.hostname.includes('cbioportal.org');

  if (isApi) {
    // Dados da API: network-first (dados frescos), fallback para cache
    event.respondWith(
      fetch(request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  if (isCDN) {
    // CDN: stale-while-revalidate
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // App shell (mesmo domínio): cache-first
  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
    )
  );
});
