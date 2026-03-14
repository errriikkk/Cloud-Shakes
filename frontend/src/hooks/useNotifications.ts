"use client";

import { useEffect, useState, useCallback } from "react";
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

// Detect if PWA is installed (iOS specific check)
const isPWAInstalled = () => {
    if (typeof window === 'undefined') return false;
    try {
        // iOS PWA detection
        if (isIOS()) {
            return (window.navigator as any).standalone === true || 
                   window.matchMedia('(display-mode: standalone)').matches;
        }
        // Android/Desktop PWA detection
        return window.matchMedia('(display-mode: standalone)').matches ||
               (window.navigator as any).standalone === true;
    } catch {
        return false;
    }
};

export function useNotifications() {
    const { user } = useAuth();
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [isSupported, setIsSupported] = useState(false);
    const [isIOSDevice, setIsIOSDevice] = useState(false);
    const [isPWA, setIsPWA] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        try {
            const ios = isIOS();
            const pwa = isPWAInstalled();
            setIsIOSDevice(ios);
            setIsPWA(pwa);
            
            // iOS supports notifications in Safari (iOS 16.4+) and installed PWAs
            const supported = "Notification" in window && 
                              (ios ? (pwa || true) : true); // iOS needs PWA for background, but basic notifications work
            
            setIsSupported(supported);
            if ("Notification" in window) {
                setPermission(Notification.permission);
            }
        } catch (err) {
            console.error("Error initializing notifications:", err);
            setIsSupported(false);
        }
    }, []);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            console.warn("Notifications not supported");
            return false;
        }

        if (permission === "granted") {
            return true;
        }

        try {
            // On iOS, we need user interaction to request permission
            // The permission request must be triggered by a user gesture
            const result = await Notification.requestPermission();
            setPermission(result);
            
            // For iOS, show helpful message if PWA not installed
            if (isIOSDevice && result === "granted" && !isPWA) {
                console.info("💡 Para recibir notificaciones en background en iOS, instala la app agregándola a la pantalla de inicio");
            }
            
            return result === "granted";
        } catch (err) {
            console.error("Error requesting notification permission:", err);
            return false;
        }
    }, [isSupported, permission, isIOSDevice, isPWA]);

    const showEventNotification = useCallback((event: CalendarEvent, reminderMinutes: number) => {
        if (!isSupported || permission !== "granted" || typeof window === 'undefined' || typeof Notification === 'undefined') return;

        const eventDate = new Date(event.startDate);
        
        // iOS has limitations with icons and badges
        const options: NotificationOptions = {
            body: event.allDay
                ? `Evento todo el día`
                : `Comienza a las ${eventDate.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                  })}`,
            tag: `event-${event.id}`,
            requireInteraction: isIOSDevice, // iOS: keep notification visible longer
            silent: false,
            data: {
                eventId: event.id,
                url: `/dashboard/calendar`,
            },
        };

        // iOS doesn't support icon/badge in all cases
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
                // Use full URL for iOS
                const url = window.location.origin + `/dashboard/calendar`;
                window.location.href = url;
                notification.close();
            };

            // Auto-close after longer time on iOS
            setTimeout(() => {
                notification.close();
            }, isIOSDevice ? 15000 : 10000);
        } catch (err) {
            console.error("Error showing notification:", err);
        }
    }, [isSupported, permission, isIOSDevice]);

    const checkUpcomingEvents = useCallback(async () => {
        if (!user || permission !== "granted" || typeof window === 'undefined') return;

        try {
            const now = new Date();
            const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            const res = await axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                params: {
                    month: now.getMonth() + 1,
                    year: now.getFullYear(),
                },
                withCredentials: true,
            });

            const events: CalendarEvent[] = res.data || [];
            const upcomingEvents = events.filter((event) => {
                const eventDate = new Date(event.startDate);
                return eventDate >= now && eventDate <= in24Hours;
            });

            // Check each event for reminder time
            for (const event of upcomingEvents) {
                const eventDate = new Date(event.startDate);
                const reminderMinutes = event.reminderMinutes || 15; // Default 15 minutes
                const reminderTime = new Date(eventDate.getTime() - reminderMinutes * 60 * 1000);
                const currentTime = new Date();

                // Check if we should show notification (within 1 minute of reminder time)
                if (
                    reminderTime.getTime() <= currentTime.getTime() &&
                    reminderTime.getTime() > currentTime.getTime() - 60 * 1000
                ) {
                    // Check if we've already notified for this event
                    const notificationKey = `event_reminder_${event.id}_${Math.floor(reminderTime.getTime() / (60 * 1000))}`;
                    const alreadyNotified = typeof localStorage !== 'undefined' ? localStorage.getItem(notificationKey) : null;

                    if (!alreadyNotified) {
                        showEventNotification(event, reminderMinutes);
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem(notificationKey, "true");
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error checking upcoming events:", err);
        }
    }, [user, permission, showEventNotification]);

    // Check for upcoming events every minute
    // On iOS, this only works when app is active (unless PWA is installed)
    useEffect(() => {
        if (!user || permission !== "granted" || typeof window === 'undefined') return;

        let isMounted = true;

        // Initial check (with delay to avoid blocking render)
        const timeout = setTimeout(() => {
            if (isMounted) {
                checkUpcomingEvents();
            }
        }, 2000);

        // Check every minute (or more frequently on iOS for better reliability)
        const intervalTime = isIOSDevice ? 30 * 1000 : 60 * 1000; // Check every 30s on iOS
        const interval = setInterval(() => {
            if (isMounted) {
                checkUpcomingEvents();
            }
        }, intervalTime);

        // For iOS, also check when page becomes visible (user returns to app)
        const handleVisibilityChange = () => {
            if (isMounted && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                checkUpcomingEvents();
            }
        };
        
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            clearInterval(interval);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [user, permission, isIOSDevice]);

    return {
        isSupported,
        permission,
        requestPermission,
        checkUpcomingEvents,
        isIOSDevice,
        isPWA,
    };
}

