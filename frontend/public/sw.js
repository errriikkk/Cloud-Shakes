const CACHE_NAME = 'shakes-cloud-cache-v1';
// Minimal cache list - removed manifest as it can be flaky during first load
const URLS_To_CACHE = ['/favicon.ico', '/logo-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const url of URLS_To_CACHE) {
                try {
                    await cache.add(url);
                } catch (err) {
                    console.warn(`[SW] Failed to cache: ${url}`, err);
                }
            }
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Don't intercept API requests - let them go through normally
    // This prevents CORS issues and ensures credentials are passed correctly
    if (event.request.url.includes('/api/') || event.request.url.includes('api.shakes.es')) {
        return; // Let the browser handle these requests
    }

    // Cache-first strategy for static assets only
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // Return offline fallback if needed
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Notification handling for calendar reminders
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    const urlToOpen = data?.url || '/dashboard/calendar';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        }).then((clientList) => {
            // Check if there's already a window/tab open with the target URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window/tab
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Periodic background sync for checking reminders (if supported)
self.addEventListener('sync', (event) => {
    if (event.tag === 'check-reminders') {
        event.waitUntil(
            // This will be handled by the main app
            self.registration.showNotification('Recordatorios', {
                body: 'Verificando eventos próximos...',
                icon: '/logo-192.png',
                badge: '/logo-192.png',
                tag: 'reminder-check',
            })
        );
    }
});
