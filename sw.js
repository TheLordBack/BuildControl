const CACHE_NAME = "buildcontrol-pwa-v5";
const ARQUIVOS_CACHE = [
  "./", "./index.html", "./login.html", "./style.css", "./script.js", "./login.js",
  "./manifest.json", "./imagens/icon-192.png", "./imagens/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(ARQUIVOS_CACHE.map(arquivo => cache.add(arquivo)))));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html"))));
});
