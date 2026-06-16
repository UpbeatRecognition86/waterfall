/* Arth service worker — offline app shell.
   Network-first for the HTML document (so updates show), cache-first for
   static same-origin assets. The CDN pdf.js (statement parsing) is left to
   the network — it's only fetched when the user uploads a PDF. */
const CACHE = "arth-v1";
const ASSETS = [
  "./", "index.html", "parser.js", "gsap.min.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // CDN (pdf.js) → network
  const isDoc = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isDoc) {
    e.respondWith(
      fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })
        .catch(() => caches.match(req).then(m => m || caches.match("index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(m => m || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; }))
  );
});
