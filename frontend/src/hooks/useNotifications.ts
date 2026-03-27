"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";

interface CalendarEvent {
    id: string;
    title: string;
    startDate: string;
    endDate: string | null;
    allDay: boolean;
    reminderMinutes?: number | null;
}

interface PushSubscriptionJSON {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

// Detect iOS
const isIOS = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    try {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    } catch {
        return false;
    }
};

// Detect if PWA is installed
const isPWAInstalled = () => {
    if (typeof window === 'undefined') return false;
    try {
        if (isIOS()) {
            return (window.navigator as any).standalone === true || 
                   window.matchMedia('(display-mode: standalone)').matches;
        }
        return window.matchMedia('(display-mode: standalone)').matches ||
               (window.navigator as any).standalone === true;
    } catch {
        return false;
    }
};

// Convert Base64 to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function useNotifications() {
    const { user } = useAuth();
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [isSupported, setIsSupported] = useState(false);
    const [isIOSDevice, setIsIOSDevice] = useState(false);
    const [isPWA, setIsPWA] = useState(false);
    const [pushSubscription, setPushSubscription] = useState<PushSubscriptionJSON | null>(null);
    const notifiedEventsRef = useRef<Set<string>>(new Set());
    const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

    // Initialize
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        try {
            const ios = isIOS();
            const pwa = isPWAInstalled();
            setIsIOSDevice(ios);
            setIsPWA(pwa);
            
            const supported = "Notification" in window && 
                              (ios ? (pwa || true) : true);
            
            setIsSupported(supported);
            if ("Notification" in window) {
                setPermission(Notification.permission);
            }
        } catch (err) {
            console.error("Error initializing notifications:", err);
            setIsSupported(false);
        }
    }, []);

    // Register service worker and subscribe to push
    const subscribeToPush = useCallback(async (): Promise<PushSubscriptionJSON | null> => {
        if (!isSupported || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            console.warn("Push not supported");
            return null;
        }

        try {
            // Register service worker if not already
            let registration = swRegistrationRef.current;
            if (!registration) {
                registration = await navigator.serviceWorker.register('/sw.js');
                swRegistrationRef.current = registration;
                console.log('[Push] Service Worker registered');
            }

            // Check if already subscribed
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                console.log('[Push] Already subscribed');
                const json = existingSubscription.toJSON() as PushSubscriptionJSON;
                setPushSubscription(json);
                return json;
            }

            // Subscribe to push
            const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
            });

            const json = subscription.toJSON() as PushSubscriptionJSON;
            console.log('[Push] Subscribed successfully:', json.endpoint);
            setPushSubscription(json);

            // Send subscription to backend
            try {
                await axios.post('/api/notifications/subscribe', json, {
                    withCredentials: true,
                });
                console.log('[Push] Subscription saved to backend');
            } catch (err) {
                console.error('[Push] Failed to save subscription:', err);
            }

            return json;
        } catch (err) {
            console.error('[Push] Subscription failed:', err);
            return null;
        }
    }, [isSupported]);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            console.warn("Notifications not supported");
            return false;
        }

        if (permission === "granted") {
            // Also subscribe to push when permission is already granted
            subscribeToPush();
            return true;
        }

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            
            if (result === "granted") {
                // Subscribe to push notifications
                await subscribeToPush();
            }
            
            if (isIOSDevice && result === "granted" && !isPWA) {
                console.info("💡 Para recibir notificaciones en background en iOS, instala la app agregándola a la pantalla de inicio");
            }
            
            return result === "granted";
        } catch (err) {
            console.error("Error requesting notification permission:", err);
            return false;
        }
    }, [isSupported, permission, isIOSDevice, isPWA, subscribeToPush]);

    const showEventNotification = useCallback((event: CalendarEvent, reminderMinutes: number) => {
        if (!isSupported || permission !== "granted" || typeof window === 'undefined' || typeof Notification === 'undefined') return;

        const notificationKey = `event-${event.id}-${reminderMinutes}`;
        if (notifiedEventsRef.current.has(notificationKey)) {
            return;
        }
        notifiedEventsRef.current.add(notificationKey);

        const eventDate = new Date(event.startDate);
        
        const options: NotificationOptions = {
            body: event.allDay
                ? `Evento todo el día`
                : `Comienza a las ${eventDate.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                  })}`,
            tag: `event-${event.id}`,
            requireInteraction: isIOSDevice,
            silent: false,
            data: {
                eventId: event.id,
                url: `/dashboard/calendar`,
            },
        };

        if (!isIOSDevice) {
            options.icon = "/logo-192.png";
            options.badge = "/logo-192.png";
        }

        try {
            const notification = new Notification(event.title, options);

            notification.onclick = (e) => {
                e.preventDefault();
                if (window.focus) {
                    window.focus();
                }
                const url = window.location.origin + `/dashboard/calendar`;
                window.location.href = url;
                notification.close();
            };

            setTimeout(() => {
                notification.close();
                notifiedEventsRef.current.delete(notificationKey);
            }, isIOSDevice ? 15000 : 10000);
        } catch (err) {
            console.error("Error showing notification:", err);
            notifiedEventsRef.current.delete(notificationKey);
        }
    }, [isSupported, permission, isIOSDevice]);

    const checkUpcomingEvents = useCallback(async () => {
        if (!user || permission !== "granted" || typeof window === 'undefined') return;

        try {
            const now = new Date();
            const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
            const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

            const [resCurrent, resNext] = await Promise.all([
                axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                    params: { month: currentMonth, year: currentYear },
                    withCredentials: true,
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                    params: { month: nextMonth, year: nextYear },
                    withCredentials: true,
                }).catch(() => ({ data: [] })),
            ]);

            const events: CalendarEvent[] = [...(resCurrent.data || []), ...(resNext.data || [])];
            const currentTime = new Date();

            for (const event of events) {
                const eventDate = new Date(event.startDate);
                
                if (eventDate < currentTime) continue;
                if (eventDate > in24Hours) continue;

                const reminderMinutes = event.reminderMinutes || 15;
                const reminderTime = new Date(eventDate.getTime() - reminderMinutes * 60 * 1000);

                const timeDiff = currentTime.getTime() - reminderTime.getTime();
                if (timeDiff >= 0 && timeDiff <= 120 * 1000) {
                    const uniqueKey = `${event.id}-${reminderMinutes}`;
                    const storageKey = `notified_${uniqueKey}`;
                    
                    const lastNotified = localStorage.getItem(storageKey);
                    const oneHourAgo = Date.now() - 60 * 60 * 1000;
                    
                    if (!lastNotified || parseInt(lastNotified) < oneHourAgo) {
                        showEventNotification(event, reminderMinutes);
                        localStorage.setItem(storageKey, Date.now().toString());
                    }
                }
            }
        } catch (err) {
            console.error("Error checking upcoming events:", err);
        }
    }, [user, permission, showEventNotification]);

    // Check for upcoming events
    useEffect(() => {
        if (!user || permission !== "granted" || typeof window === 'undefined') return;

        let isMounted = true;

        const timeout = setTimeout(() => {
            if (isMounted) {
                checkUpcomingEvents();
            }
        }, 3000);

        const interval = setInterval(() => {
            if (isMounted) {
                checkUpcomingEvents();
            }
        }, 30000);

        const handleVisibilityChange = () => {
            if (isMounted && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                checkUpcomingEvents();
            }
        };
        
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const handleFocus = () => {
            if (isMounted) {
                checkUpcomingEvents();
            }
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            clearInterval(interval);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            window.removeEventListener('focus', handleFocus);
        };
    }, [user, permission, checkUpcomingEvents]);

    // Cleanup old notification keys
    useEffect(() => {
        if (typeof localStorage === 'undefined') return;
        
        try {
            const keys = Object.keys(localStorage);
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            
            for (const key of keys) {
                if (key.startsWith('notified_')) {
                    const value = localStorage.getItem(key);
                    if (value && parseInt(value) < oneDayAgo) {
                        localStorage.removeItem(key);
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }, []);

    return {
        isSupported,
        permission,
        setPermission,
        requestPermission,
        subscribeToPush,
        checkUpcomingEvents,
        isIOSDevice,
        isPWA,
        pushSubscription,
    };
}

