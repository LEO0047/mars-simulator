// Mars Transfer Lab 離線快取。
// 策略：same-origin GET 一律 stale-while-revalidate——先回快取秒開，
// 背景抓新版更新快取，下次重新整理就是新版。改版不需要動這個檔案。
const CACHE_NAME = 'mars-transfer-lab-v1';

const PRECACHE = [
    './',
    './index.html',
    './styles.css',
    './app.mjs',
    './simulation.mjs',
    './assets/generated/deep-space-background.png',
    './assets/generated/celestial-atlas.png',
    './assets/fonts/fonts.css',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
            ))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(request);
            const refresh = fetch(request)
                .then((response) => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                })
                .catch(() => cached);
            return cached || refresh;
        }),
    );
});
