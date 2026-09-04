// Atomic, versioned app shell. Bump this version whenever a cached file changes.
const CACHE_NAME = 'mars-transfer-lab-v2.0.0';
const PRECACHE = [
    './',
    './index.html',
    './styles.css',
    './app.mjs',
    './simulation.mjs',
    './landing.mjs',
    './surface.mjs',
    './assets/favicon.svg',
    './assets/generated/deep-space-background.png',
    './assets/generated/celestial-atlas.png',
    './assets/fonts/fonts.css',
    ...[
        'barlow-condensed-500',
        'barlow-condensed-600',
        'barlow-condensed-700',
        'ibm-plex-mono-400',
        'ibm-plex-mono-500',
        'ibm-plex-mono-600',
        'inter-400',
        'inter-500',
        'inter-600',
    ].map((font) => `./assets/fonts/${font}.woff2`),
];
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
    );
    // Let existing tabs finish on their current release. New tabs/reloads after
    // those clients close activate the fully cached release together.
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (key) =>
                                key.startsWith('mars-transfer-lab-') &&
                                key !== CACHE_NAME,
                        )
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (
        request.method !== 'GET' ||
        url.origin !== self.location.origin ||
        !url.href.startsWith(self.registration.scope)
    )
        return;
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(request);
            if (cached) return cached;
            return fetch(request);
        }),
    );
});
