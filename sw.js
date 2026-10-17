const CACHE = "banden-tracker-v1";
const ASSETS = [
  "/banden-tracker/",
  "/banden-tracker/index.html",
  "/banden-tracker/css/styles.css",
  "/banden-tracker/js/app.js",
  "/banden-tracker/js/api.js",
  "/banden-tracker/js/i18n.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin && e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});