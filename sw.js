/* Service worker: tine doar fisierele aplicatiei (fara date). Datele vin mereu live de la Mac. */
const VERSIUNE = 'panou-v12';
const FISIERE = [
  './', 'index.html', 'app.css?v=12', 'app.js?v=12', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'fonts/Rubik-500-latin.woff2', 'fonts/Rubik-500-latin-ext.woff2', 'fonts/Rubik-600-latin.woff2', 'fonts/Rubik-600-latin-ext.woff2',
  'fonts/Lexend-400-latin.woff2', 'fonts/Lexend-400-latin-ext.woff2', 'fonts/Lexend-500-latin.woff2', 'fonts/Lexend-500-latin-ext.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIUNE).then((c) => c.addAll(FISIERE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSIUNE).map((x) => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // API-ul (alt domeniu) nu trece pe aici
  // retea intai, ca o versiune noua sa ajunga imediat; cache-ul doar cand nu e semnal
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copie = r.clone(); caches.open(VERSIUNE).then((c) => c.put(e.request, copie)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
