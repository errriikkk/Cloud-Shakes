"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
    Bell,
    Calendar as CalIcon,
    ChevronLeft,
    ChevronRight,
    List,
    Plus,
    Search,
    X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import {
    addDays,
    addMonths,
    eachDayOfInterval,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EventModal } from "@/components/EventModal";
import { useModal } from "@/hooks/useModal";
import { useNotifications } from "@/hooks/useNotifications";
import { motion } from "framer-motion";
import { ActivityAvatar } from "@/components/ActivityAvatar";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermission } from "@/hooks/usePermission";

interface CalendarEvent {
    id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string | null;
    allDay: boolean;
    pinned: boolean;
    color: string;
    reminderMinutes?: number | null;
    owner?: { id: string; username: string; displayName: string };
    lastModifiedBy?: { id: string; username: string; displayName: string } | null;
}

const COLOR_DOT: Record<string, string> = {
    primary: "bg-primary",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-rose-500",
    purple: "bg-violet-500",
};

type CalendarView = "month" | "week" | "agenda";

export default function CalendarPage() {
    const { t, locale } = useTranslation();
    const dateLocale = locale === 'es' ? es : enUS;
    const { canCreateEvents, canEditEvents, canDeleteEvents } = usePermission();
    
    const { confirm, alert, ModalComponents } = useModal();
    const { isSupported, permission, requestPermission, isIOSDevice, isPWA } = useNotifications();
    const [view, setView] = useState<CalendarView>("month");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [q, setQ] = useState("");

    // Fetch events for current month view
    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                params: {
                    month: currentDate.getMonth() + 1,
                    year: currentDate.getFullYear()
                },
                withCredentials: true
            });
            setEvents(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [currentDate]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDateGrid = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDateGrid = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = useMemo(() => {
        const days: Date[] = [];
        let d = startDateGrid;
        while (d <= endDateGrid) {
            days.push(d);
            d = addDays(d, 1);
        }
        return days;
    }, [startDateGrid, endDateGrid]);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);

    const handlePrev = () => {
        if (view === "week") return setCurrentDate(addDays(currentDate, -7));
        return setCurrentDate(subMonths(currentDate, 1));
    };
    const handleNext = () => {
        if (view === "week") return setCurrentDate(addDays(currentDate, 7));
        return setCurrentDate(addMonths(currentDate, 1));
    };

    const handleOpenCreate = (day: Date) => {
        setSelectedDate(day);
        setActiveEvent(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, event: CalendarEvent) => {
        e.stopPropagation();
        setActiveEvent(event);
        setIsModalOpen(true);
    };

    const handleSaveEvent = async (data: any) => {
        try {
            if (activeEvent) {
                const res = await axios.put(API_ENDPOINTS.CALENDAR.DETAIL(activeEvent.id), data, { withCredentials: true });
                setEvents(prev => prev.map(e => e.id === activeEvent.id ? res.data : e));
            } else {
                const res = await axios.post(API_ENDPOINTS.CALENDAR.BASE, data, { withCredentials: true });
                setEvents(prev => [...prev, res.data]);
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error("Save event failed:", err);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        const confirmed = await confirm(
            t("common.confirm"),
            t("calendar.confirmDelete"),
            { type: 'danger', confirmText: t("common.delete"), cancelText: t("common.cancel") }
        );
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.CALENDAR.DETAIL(id), { withCredentials: true });
            setEvents(prev => prev.filter(e => e.id !== id));
            setIsModalOpen(false);
        } catch (err) {
            console.error("Delete failed:", err);
            await alert(t("common.error"), t("calendar.deleteFailed"), { type: 'danger' });
        }
    };

    const filteredEvents = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return events;
        return events.filter(e => {
            const hay = `${e.title} ${e.description || ""}`.toLowerCase();
            return hay.includes(s);
        });
    }, [events, q]);

    const sortedEvents = useMemo(() => {
        return [...filteredEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [filteredEvents]);

    const eventsByDay = useMemo(() => {
        const weekEnd = addDays(weekStart, 6);
        const rangeStart = startDateGrid < weekStart ? startDateGrid : weekStart;
        const rangeEnd = endDateGrid > weekEnd ? endDateGrid : weekEnd;

        const map = new Map<string, CalendarEvent[]>();

        sortedEvents.forEach((e) => {
            const evStart = startOfDay(parseISO(e.startDate));
            const evEnd = e.endDate ? endOfDay(parseISO(e.endDate)) : endOfDay(evStart);

            if (evEnd < rangeStart || evStart > rangeEnd) return;

            const clampedStart = evStart < rangeStart ? rangeStart : evStart;
            const clampedEnd = evEnd > rangeEnd ? rangeEnd : evEnd;

            eachDayOfInterval({ start: clampedStart, end: clampedEnd }).forEach((d) => {
                const key = format(d, "yyyy-MM-dd");
                const arr = map.get(key) || [];
                arr.push(e);
                map.set(key, arr);
            });
        });

        // Stable ordering inside each day
        for (const [k, arr] of map.entries()) {
            map.set(
                k,
                [...arr].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
            );
        }

        return map;
    }, [sortedEvents, startDateGrid, endDateGrid, weekStart]);

    const [showNotificationBanner, setShowNotificationBanner] = useState(false);

    useEffect(() => {
        if (isSupported && permission === "default") {
            setShowNotificationBanner(true);
        }
    }, [isSupported, permission]);

    return (
        <PermissionGuard permission="view_calendar" redirectUrl="/dashboard/home">
        <div className="pb-20 md:pb-0">
            {/* Notification Permission Banner */}
            {showNotificationBanner && isSupported && permission === "default" && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mb-4 rounded-2xl border border-border bg-muted/20 p-4 flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center border border-border">
                            <Bell className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground">Activa las notificaciones</p>
                            <p className="text-xs text-muted-foreground">
                                {isIOSDevice && !isPWA 
                                    ? "Recibe recordatorios. Para notificaciones en background, instala la app (menú → Agregar a pantalla de inicio)"
                                    : "Recibe recordatorios de tus eventos del calendario"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={async () => {
                                const granted = await requestPermission();
                                if (granted) {
                                    setShowNotificationBanner(false);
                                    const message = isIOSDevice && !isPWA
                                        ? "Notificaciones activadas. Para recibir notificaciones cuando la app esté cerrada, instálala desde el menú de Safari (compartir → Agregar a pantalla de inicio)."
                                        : "Las notificaciones están activadas. Recibirás recordatorios de tus eventos.";
                                    await alert("Éxito", message, { type: 'success' });
                                } else {
                                    await alert("Permisos denegados", "Las notificaciones están desactivadas. Puedes activarlas desde la configuración del navegador.", { type: 'warning' });
                                }
                            }}
                            className="rounded-xl h-9"
                        >
                            Activar
                        </Button>
                        <button
                            onClick={() => setShowNotificationBanner(false)}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Header (enterprise, sticky) */}
            <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
                <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                {t("calendar.title")}
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                {format(currentDate, "MMMM yyyy", { locale: dateLocale })}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={handlePrev} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background hover:bg-muted/40">
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button onClick={() => setCurrentDate(new Date())} className="h-10 rounded-2xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted/40">
                                {t("calendar.today")}
                            </button>
                            <button onClick={handleNext} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background hover:bg-muted/40">
                                <ChevronRight className="h-5 w-5" />
                            </button>

                            <div className="mx-1 hidden sm:block h-6 w-px bg-border" />

                            <Button
                                onClick={() => handleOpenCreate(new Date())}
                                disabled={!canCreateEvents()}
                                title={canCreateEvents() ? t("calendar.newEvent") : t("chat.noPermission")}
                                className="rounded-2xl h-10 bg-foreground text-background hover:opacity-95"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t("calendar.newEvent")}
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={t("search.placeholder")}
                                className="h-10 w-full rounded-2xl border border-border bg-muted/20 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <ViewPill active={view === "month"} onClick={() => setView("month")} icon={CalIcon} label={t("calendar.views.month")} />
                            <ViewPill active={view === "week"} onClick={() => setView("week")} icon={List} label={t("calendar.views.week")} />
                            <ViewPill active={view === "agenda"} onClick={() => setView("agenda")} icon={List} label={t("calendar.views.agenda")} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="px-4 py-6 sm:px-6">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-16 rounded-2xl border border-border bg-muted/20 animate-pulse" />
                        ))}
                    </div>
                ) : view === "month" ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-background">
                        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
                            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                                <div key={d} className="py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day) => {
                                const dayKey = format(day, "yyyy-MM-dd");
                                const dayEvents = (eventsByDay.get(dayKey) || []).slice(0, 3);
                                const isCurrent = isSameMonth(day, currentDate);
                                return (
                                    <div
                                        key={day.toISOString()}
                                        onClick={() => canCreateEvents() && handleOpenCreate(day)}
                                        className={cn(
                                            "min-h-[104px] border-b border-r border-border p-2 hover:bg-muted/20 transition-colors",
                                            !isCurrent && "bg-muted/10 text-muted-foreground/60",
                                            canCreateEvents() ? "cursor-pointer" : "cursor-default"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={cn(
                                                "flex h-7 w-7 items-center justify-center rounded-xl text-xs font-semibold",
                                                isToday(day) ? "bg-foreground text-background" : "text-muted-foreground"
                                            )}>
                                                {format(day, "d")}
                                            </div>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                            {dayEvents.map((ev) => (
                                                <button
                                                    key={ev.id}
                                                    onClick={(e) => { if (canEditEvents()) handleOpenEdit(e as any, ev); }}
                                                    className={cn(
                                                        "w-full rounded-lg border border-border bg-background px-2 py-1 text-left text-[11px] font-semibold text-foreground truncate hover:bg-muted/30",
                                                        !canEditEvents() && "cursor-default hover:bg-background"
                                                    )}
                                                >
                                                    <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", COLOR_DOT[ev.color] || COLOR_DOT.primary)} />
                                                    {ev.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : view === "week" ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                        {weekDays.map((day) => {
                            const key = format(day, "yyyy-MM-dd");
                            const dayEvents = eventsByDay.get(key) || [];
                            return (
                                <div key={key} className="rounded-2xl border border-border bg-background p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-semibold text-muted-foreground">
                                            {format(day, "EEE", { locale: dateLocale })}
                                        </div>
                                        <div className={cn(
                                            "h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold",
                                            isToday(day) ? "bg-foreground text-background" : "bg-muted/30 text-foreground"
                                        )}>
                                            {format(day, "d")}
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {dayEvents.length === 0 ? (
                                            <div className="text-xs text-muted-foreground">{t("calendar.noEvents")}</div>
                                        ) : (
                                            dayEvents.map((ev) => (
                                                <button
                                                    key={ev.id}
                                                    onClick={(e) => { if (canEditEvents()) handleOpenEdit(e as any, ev); }}
                                                    className={cn(
                                                        "w-full rounded-xl border border-border bg-background px-3 py-2 text-left hover:bg-muted/30",
                                                        !canEditEvents() && "cursor-default hover:bg-background"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_DOT[ev.color] || COLOR_DOT.primary)} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-xs font-semibold text-foreground">{ev.title}</div>
                                                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                                {ev.allDay ? t("calendar.eventAllDay") : format(parseISO(ev.startDate), "HH:mm")}
                                                            </div>
                                                        </div>
                                                        <ActivityAvatar user={ev.lastModifiedBy || ev.owner} resourceId={ev.id} resourceType="calendar" />
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sortedEvents.length === 0 ? (
                            <div className="text-center py-16 text-muted-foreground">
                                <CalIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">{t("calendar.noEventsYet")}</p>
                                {canCreateEvents() && (
                                    <Button onClick={() => handleOpenCreate(new Date())} variant="link" className="mt-4">
                                        {t("calendar.createFirst")}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            Array.from(eventsByDay.entries()).map(([dayKey, dayEvents]) => (
                                <div key={dayKey} className="rounded-2xl border border-border bg-background">
                                    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                                        <div className="text-sm font-semibold text-foreground">
                                            {format(parseISO(`${dayKey}T00:00:00`), "EEEE, d MMMM", { locale: dateLocale })}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{dayEvents.length}</div>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {dayEvents.map((ev) => (
                                            <button
                                                key={ev.id}
                                                onClick={(e) => { if (canEditEvents()) handleOpenEdit(e as any, ev); }}
                                                className={cn(
                                                    "w-full px-4 py-3 text-left hover:bg-muted/20 transition-colors",
                                                    !canEditEvents() && "cursor-default hover:bg-background"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", COLOR_DOT[ev.color] || COLOR_DOT.primary)} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="truncate text-sm font-semibold text-foreground">{ev.title}</div>
                                                            <div className="shrink-0 text-[11px] text-muted-foreground">
                                                                {ev.allDay ? t("calendar.eventAllDay") : format(parseISO(ev.startDate), "HH:mm")}
                                                            </div>
                                                        </div>
                                                        {ev.description && (
                                                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                                {String(ev.description)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <ActivityAvatar user={ev.lastModifiedBy || ev.owner} resourceId={ev.id} resourceType="calendar" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            <ModalComponents />
            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveEvent}
                onDelete={canDeleteEvents() ? handleDeleteEvent : undefined}
                initialData={activeEvent}
                selectedDate={selectedDate}
            />
        </div>
        </PermissionGuard>
    );
}

function ViewPill({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors",
                active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted/30"
            )}
        >
            <Icon className="h-4 w-4" />
            {label}
        </button>
    );
}
