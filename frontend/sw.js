const CACHE_NAME = "northline-v1";

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                return cached || fetch(event.request).then((response) => {

                    if (
                        event.request.method === "GET" &&
                        response.status === 200
                    ) {
                        const clone = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, clone));
                    }

                    return response;
                });
            })
    );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});