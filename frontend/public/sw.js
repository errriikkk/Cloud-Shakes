const CACHE_NAME = 'shakes-cloud-cache-v1';
const URLS_To_CACHE = ['/favicon.ico', '/logo-192.png'];

// VAPID keys - these should be generated once and kept secret on server
// For now, we'll use a placeholder that works for demo
const PUBLIC_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

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
    // Activate immediately
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/') || event.request.url.includes('api.shakes.es')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
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
    // Take control immediately
    self.clients.claim();
});

// Push notification handler - for background notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    let data = {
        title: 'Shakes Cloud',
        body: 'Nueva notificación',
        icon: '/logo-192.png',
        badge: '/logo-192.png',
        tag: 'shakes-notification',
        data: { url: '/dashboard/calendar' }
    };
    
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        console.log('[SW] Push data is not JSON, using text');
        data.body = event.data ? event.data.text() : data.body;
    }
    
    const options = {
        body: data.body,
        icon: data.icon || '/logo-192.png',
        badge: data.badge || '/logo-192.png',
        tag: data.tag || 'shakes-notification',
        data: data.data || { url: '/dashboard/calendar' },
        requireInteraction: true,
        vibrate: [200, 100, 200],
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click:', event);
    event.notification.close();
    
    if (event.action === 'dismiss') {
        return;
    }
    
    const data = event.notification.data || {};
    const urlToOpen = data.url || '/dashboard/calendar';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        }).then((clientList) => {
            // Check if there's already a window/tab open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if none found
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Background sync for checking reminders
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'check-reminders') {
        event.waitUntil(
            self.registration.showNotification('Shakes Cloud', {
                body: 'Verificando recordatorios...',
                icon: '/logo-192.png',
                tag: 'reminder-check',
            })
        );
    }
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, data } = event.data;
        
        self.registration.showNotification(title, {
            body: body,
            icon: icon || '/logo-192.png',
            badge: '/logo-192.png',
            tag: 'shakes-notification',
            data: data || { url: '/dashboard/calendar' },
            requireInteraction: true,
        });
    }
});
