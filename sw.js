// Service worker: app files are cached for offline use.
// timetable.json is fetched fresh when online, and the saved copy is used when offline.
const CACHE = "ist-timetable-v1"; // change this name whenever you edit app files
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json",
               "icons/icon-192.png", "icons/icon-512.png", "timetable.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith("timetable.json")) {
    // Network first: newest timetable when online, saved copy when offline
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("timetable.json", copy));
        return res;
      }).catch(() => caches.match("timetable.json"))
    );
    return;
  }
  // Cache first for the app itself
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
