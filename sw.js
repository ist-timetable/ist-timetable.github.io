// Service worker: always use the newest files when online,
// and fall back to the saved copy when offline.
const CACHE = "ist-timetable-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json",
               "icons/icon-192.png", "icons/icon-512.png", "timetable.json"];

self.addEventListener("install", (e) => {
  // cache: "reload" skips Chrome's own cache, so we never save stale files
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Network first for everything: fresh files online, saved copy offline
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
