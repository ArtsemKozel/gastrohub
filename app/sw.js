const CACHE_NAME = 'gastrohub-v1';
const PRECACHE = [
    '/app/admin.html',
    '/app/employee.html',
    '/app/pos.html',
    '/app/assets/logo.png',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).then(response => {
            if (response.redirected || response.type === 'opaqueredirect') {
                return response;
            }
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
        }).catch(() => caches.match(event.request))
    );
});
