const CACHE = "magic-auction-v170";

const ASSETS = [
  "./index.html",
  "./styles.css?v=170",
  "./app.js?v=170",
  "./data/auction.json?v=170",
  "./data/treasures.json?v=170",
  "./manifest.webmanifest",
  "./icon.png?v=170"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(request, { cache: "reload" }));
    return;
  }

  const fallback = request.mode === "navigate" ? "./index.html" : null;
  event.respondWith(networkFirst(request, fallback));
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response.ok) cache.put(fallback || request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (fallback ? await cache.match(fallback) : null);
    if (cached) return cached;
    throw error;
  }
}

