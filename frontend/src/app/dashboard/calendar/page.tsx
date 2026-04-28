"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
    Bell,
    Calendar as CalIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Search,
    X,
    Clock,
    Users,
    MapPin,
    CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import {
    addDays,
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    getWeek,
    isSameDay,
    isSameMonth,
    isToday,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks,
    addHours,
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { EventModal } from "@/components/EventModal";
import { useModal } from "@/hooks/useModal";
import { useNotifications } from "@/hooks/useNotifications";
import { motion, AnimatePresence } from "framer-motion";
import { ActivityAvatar } from "@/components/ActivityAvatar";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/context/AuthContext";
import { showPermissionDenied } from "@/lib/permissionFeedback";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventColor = "green" | "blue" | "red" | "purple" | "orange" | "pink" | "teal";
type View = "month" | "week" | "day" | "agenda";
type EventKind = "all" | "meeting" | "deadline" | "personal" | "allDay";

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

// ─── Color system ─────────────────────────────────────────────────────────────

const BACKEND_COLOR_MAP: Record<string, EventColor> = {
    primary: "purple", blue: "blue", green: "green", yellow: "orange",
    red: "red", purple: "purple", emerald: "green", rose: "red",
    amber: "orange", violet: "purple",
};

const EV_STYLES: Record<EventColor, { bg: string; border: string; text: string; dot: string }> = {
    purple: { bg: "bg-violet-50",  border: "border-l-violet-500", text: "text-violet-800", dot: "bg-violet-500" },
    blue:   { bg: "bg-blue-50",    border: "border-l-blue-500",   text: "text-blue-800",   dot: "bg-blue-500"   },
    green:  { bg: "bg-emerald-50", border: "border-l-emerald-500",text: "text-emerald-800",dot: "bg-emerald-500" },
    red:    { bg: "bg-rose-50",    border: "border-l-rose-500",   text: "text-rose-800",   dot: "bg-rose-500"   },
    orange: { bg: "bg-amber-50",   border: "border-l-amber-500",  text: "text-amber-800",  dot: "bg-amber-500"  },
    pink:   { bg: "bg-pink-50",    border: "border-l-pink-500",   text: "text-pink-800",   dot: "bg-pink-500"   },
    teal:   { bg: "bg-teal-50",    border: "border-l-teal-500",   text: "text-teal-800",   dot: "bg-teal-500"   },
};

const DOT_COLORS: Record<EventColor, string> = {
    purple: "#7C6FF7", blue: "#3B82F6", green: "#10B981",
    red: "#F43F5E", orange: "#F59E0B", pink: "#EC4899", teal: "#14B8A6",
};

function evColor(color: string) {
    return BACKEND_COLOR_MAP[color] || "purple";
}

function classifyEvent(event: CalendarEvent): Exclude<EventKind, "all"> {
    if (event.allDay) return "allDay";
    const hay = `${event.title} ${event.description || ""}`.toLowerCase();
    if (/(meeting|reunion|call|standup)/.test(hay)) return "meeting";
    if (/(deadline|entrega|due|limit|venc)/.test(hay)) return "deadline";
    return "personal";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(d: Date) {
    const clone = new Date(d);
    const day = clone.getDay() || 7;
    clone.setDate(clone.getDate() - day + 1);
    return clone;
}

const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
            )}
        >
            {label}
        </button>
    );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "h-7 px-3 rounded-full text-[11px] font-medium border transition-all",
                active
                    ? "bg-violet-50 border-violet-300 text-violet-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
            )}
        >
            {label}
        </button>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CalendarPage() {
    const { t, locale } = useTranslation();
    const { user } = useAuth();
    const dateLocale = locale === "es" ? es : enUS;
    const { canCreateEvents, canEditEvents, canDeleteEvents } = usePermission();
    const { confirm, alert, ModalComponents } = useModal();
    const { isSupported, permission, requestPermission, isIOSDevice, isPWA } = useNotifications();

    const [view, setView] = useState<View>("month");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [miniDate, setMiniDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [q, setQ] = useState("");
    const [activeFilter, setActiveFilter] = useState<"all" | "mine" | "team" | "external">("all");
    const [eventKind, setEventKind] = useState<EventKind>("all");
    const [showNotificationBanner, setShowNotificationBanner] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const bodyRef = useRef<HTMLDivElement>(null);
    const weekScrollRef = useRef<HTMLDivElement>(null);

    // Scroll detection for compact header
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const handler = () => setScrolled(el.scrollTop > 10);
        el.addEventListener("scroll", handler, { passive: true });
        return () => el.removeEventListener("scroll", handler);
    }, []);

    // Scroll week view to current time
    useEffect(() => {
        if (view === "week" && weekScrollRef.current) {
            const now = new Date();
            setTimeout(() => {
                if (weekScrollRef.current)
                    weekScrollRef.current.scrollTop = Math.max(0, (now.getHours() - 1) * 44);
            }, 60);
        }
    }, [view]);

    // Notifications banner
    useEffect(() => {
        if (isSupported && permission === "default") setShowNotificationBanner(true);
    }, [isSupported, permission]);

    // Fetch events
    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                params: { month: currentDate.getMonth() + 1, year: currentDate.getFullYear() },
                withCredentials: true,
            });
            setEvents(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [currentDate]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    // ── Derived data ──────────────────────────────────────────────────────────

    const filteredEvents = useMemo(() => {
        const scoped = events.filter((e) => {
            if (activeFilter === "all") return true;
            if (activeFilter === "mine") return !!user && e.owner?.id === user.id;
            if (activeFilter === "team") return !!e.owner?.id && !!user && e.owner.id !== user.id;
            if (activeFilter === "external") return !e.owner?.id;
            return true;
        });
        const s = q.trim().toLowerCase();
        const kindScoped =
            eventKind === "all"
                ? scoped
                : scoped.filter((e) => classifyEvent(e) === eventKind);
        if (!s) return kindScoped;
        return kindScoped.filter((e) => {
            const hay = `${e.title} ${e.description || ""}`.toLowerCase();
            return hay.includes(s);
        });
    }, [events, q, activeFilter, user, eventKind]);

    const sortedEvents = useMemo(
        () => [...filteredEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
        [filteredEvents]
    );

    const monthStart   = startOfMonth(currentDate);
    const monthEnd     = endOfMonth(monthStart);
    const gridStart    = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd      = endOfWeek(monthEnd,   { weekStartsOn: 1 });

    const calendarDays = useMemo(() => {
        const days: Date[] = [];
        let d = gridStart;
        while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }
        return days;
    }, [gridStart, gridEnd]);

    const wkStart  = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(wkStart, i)), [wkStart]);

    const eventsByDay = useMemo(() => {
        const wkEnd = addDays(wkStart, 6);
        const rangeStart = gridStart < wkStart ? gridStart : wkStart;
        const rangeEnd   = gridEnd   > wkEnd   ? gridEnd   : wkEnd;
        const map = new Map<string, CalendarEvent[]>();

        sortedEvents.forEach((e) => {
            const evStart = startOfDay(parseISO(e.startDate));
            const evEnd   = e.endDate ? endOfDay(parseISO(e.endDate)) : endOfDay(evStart);
            if (evEnd < rangeStart || evStart > rangeEnd) return;
            const cStart = evStart < rangeStart ? rangeStart : evStart;
            const cEnd   = evEnd   > rangeEnd   ? rangeEnd   : evEnd;
            eachDayOfInterval({ start: cStart, end: cEnd }).forEach((d) => {
                const key = format(d, "yyyy-MM-dd");
                const arr = map.get(key) || [];
                arr.push(e);
                map.set(key, arr);
            });
        });
        for (const [k, arr] of map.entries()) {
            map.set(k, [...arr].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
        }
        return map;
    }, [sortedEvents, gridStart, gridEnd, wkStart]);

    // ── Header derived text ───────────────────────────────────────────────────

    const headerTitle = useMemo(() => {
        if (view === "month") {
            const s = format(currentDate, "MMMM yyyy", { locale: dateLocale });
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
        if (view === "week") {
            const ws = getWeekStart(currentDate);
            const we = addDays(ws, 6);
            return `${format(ws, "d", { locale: dateLocale })} – ${format(we, "d MMM yyyy", { locale: dateLocale })}`;
        }
        return format(currentDate, "EEEE, d MMMM yyyy", { locale: dateLocale });
    }, [currentDate, view, dateLocale]);

    const weekNumber = getWeek(currentDate, { weekStartsOn: 1 });

    const monthEventCount = useMemo(() =>
        filteredEvents.filter((e) => {
            const d = parseISO(e.startDate);
            return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
        }).length,
    [filteredEvents, currentDate]);

    const todayCount = useMemo(
        () => filteredEvents.filter((e) => isSameDay(parseISO(e.startDate), new Date())).length,
        [filteredEvents]
    );
    const allDayCount = useMemo(
        () => filteredEvents.filter((e) => e.allDay).length,
        [filteredEvents]
    );
    const upcomingCount = useMemo(() => {
        const now = new Date();
        return filteredEvents.filter((e) => parseISO(e.startDate) >= now).length;
    }, [filteredEvents]);

    // Document title
    const calendarTitle = useMemo(() => {
        const lang = locale === "es" ? "es" : "en";
        const base = lang === "es" ? "Calendario" : "Calendar";
        if (loading) return `${lang === "es" ? "Cargando" : "Loading"}... · ${base}`;
        if (q.trim()) return `(${filteredEvents.length}) ${q} · ${base}`;
        if (selectedEvent) return `${selectedEvent.title} · ${base}`;
        return `${headerTitle} · ${base}`;
    }, [locale, loading, q, filteredEvents.length, selectedEvent, headerTitle]);

    useDocumentTitle(calendarTitle);

    // ── Navigation ────────────────────────────────────────────────────────────

    const handlePrev = () => {
        if (view === "week") return setCurrentDate(subWeeks(currentDate, 1));
        if (view === "day")  return setCurrentDate(addDays(currentDate, -1));
        return setCurrentDate(subMonths(currentDate, 1));
    };
    const handleNext = () => {
        if (view === "week") return setCurrentDate(addWeeks(currentDate, 1));
        if (view === "day")  return setCurrentDate(addDays(currentDate, 1));
        return setCurrentDate(addMonths(currentDate, 1));
    };
    const goToday = () => {
        setCurrentDate(new Date());
        setMiniDate(new Date());
    };

    // ── Event handlers ────────────────────────────────────────────────────────

    const handleOpenCreate = (day: Date) => {
        setSelectedDate(day);
        setActiveEvent(null);
        setSelectedEvent(null);
        setIsModalOpen(true);
    };

    const tryOpenCreate = (day: Date) => {
        if (!canCreateEvents()) {
            showPermissionDenied("No tienes permiso para crear eventos.", "create_events");
            return;
        }
        handleOpenCreate(day);
    };

    const handleOpenEdit = (e: React.MouseEvent, event: CalendarEvent) => {
        e.stopPropagation();
        setActiveEvent(event);
        setSelectedEvent(event);
        setIsModalOpen(true);
    };

    const handleEventClick = (event: CalendarEvent) => {
        setSelectedEvent(event);
        if (canEditEvents()) setActiveEvent(event);
    };

    const handleSaveEvent = async (data: unknown) => {
        try {
            if (activeEvent) {
                const res = await axios.put(API_ENDPOINTS.CALENDAR.DETAIL(activeEvent.id), data, { withCredentials: true });
                setEvents((prev) => prev.map((e) => (e.id === activeEvent.id ? res.data : e)));
            } else {
                const res = await axios.post(API_ENDPOINTS.CALENDAR.BASE, data, { withCredentials: true });
                setEvents((prev) => [...prev, res.data]);
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error("Save event failed:", err);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        const confirmed = await confirm(t("common.confirm"), t("calendar.confirmDelete"), {
            type: "danger", confirmText: t("common.delete"), cancelText: t("common.cancel"),
        });
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.CALENDAR.DETAIL(id), { withCredentials: true });
            setEvents((prev) => prev.filter((e) => e.id !== id));
            setSelectedEvent(null);
            setIsModalOpen(false);
        } catch (err) {
            console.error("Delete failed:", err);
            await alert(t("common.error"), t("calendar.deleteFailed"), { type: "danger" });
        }
    };

    // ── Mini calendar grid ────────────────────────────────────────────────────

    const miniCalDays = useMemo(() => {
        const ms = startOfMonth(miniDate);
        let start = startOfWeek(ms, { weekStartsOn: 1 });
        const days: Date[] = [];
        for (let i = 0; i < 42; i++) { days.push(start); start = addDays(start, 1); }
        return days;
    }, [miniDate]);

    // ── Upcoming events ───────────────────────────────────────────────────────

    const upcomingEvents = useMemo(() => {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        return [...events]
            .filter((e) => e.startDate.slice(0, 10) >= todayStr)
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
            .slice(0, 6);
    }, [events]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <PermissionGuard permission="view_calendar" redirectUrl="/dashboard/home">
            <div className="flex flex-col h-screen overflow-hidden bg-white">

                {/* ── STICKY HEADER ───────────────────────────────────────── */}
                <header
                    className={cn(
                        "sticky top-0 z-30 bg-white border-b border-gray-200 transition-all duration-200",
                        scrolled ? "shadow-sm" : ""
                    )}
                >
                    {/* Notification banner */}
                    <AnimatePresence>
                        {showNotificationBanner && isSupported && permission === "default" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="border-b border-amber-100 bg-amber-50 px-4 py-2 flex items-center justify-between gap-3 overflow-hidden"
                            >
                                <div className="flex items-center gap-2">
                                    <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <p className="text-xs text-amber-800">
                                        {isIOSDevice && !isPWA
                                            ? "Enable notifications — install the app for background alerts"
                                            : "Enable notifications to receive event reminders"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={async () => {
                                            const granted = await requestPermission();
                                            if (granted) {
                                                setShowNotificationBanner(false);
                                                await alert("Notifications enabled", isIOSDevice && !isPWA
                                                    ? "Install from Safari share menu for background notifications."
                                                    : "You'll receive event reminders.",
                                                    { type: "success" });
                                            } else {
                                                await alert("Permission denied", "Enable notifications from browser settings.", { type: "warning" });
                                            }
                                        }}
                                        className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
                                    >
                                        Enable
                                    </button>
                                    <button onClick={() => setShowNotificationBanner(false)} className="p-1 rounded hover:bg-amber-100">
                                        <X className="w-3 h-3 text-amber-600" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Top bar */}
                    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">

                        {/* Date pill */}
                        <button
                            onClick={goToday}
                            className="flex items-center gap-0 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden shrink-0 hover:border-gray-300 transition-colors"
                        >
                            <div className="px-3 py-2 text-center border-r border-gray-200">
                                <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest leading-none">
                                    {format(new Date(), "MMM")}
                                </div>
                                <div className="text-xl font-bold text-gray-900 leading-tight">
                                    {format(new Date(), "d")}
                                </div>
                            </div>
                            <div className={cn("px-3 py-2 transition-all duration-300", scrolled ? "opacity-0 w-0 px-0 overflow-hidden" : "opacity-100")}>
                                <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                                    {format(currentDate, "MMMM yyyy", { locale: dateLocale }).charAt(0).toUpperCase() +
                                     format(currentDate, "MMMM yyyy", { locale: dateLocale }).slice(1)}
                                </div>
                                <div className="text-[10px] text-gray-400 whitespace-nowrap">
                                    Week {weekNumber} · {monthEventCount} events
                                </div>
                            </div>
                        </button>

                        {/* Nav */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handlePrev}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                                onClick={goToday}
                                className="h-8 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Today
                            </button>
                            <button
                                onClick={handleNext}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                            >
                                <ChevronRight className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>

                        {/* Title — shown when scrolled */}
                        <div className={cn("hidden sm:flex flex-col min-w-0 transition-all duration-200", scrolled ? "opacity-100" : "opacity-0")}>
                            <span className="text-sm font-semibold text-gray-900 truncate">{headerTitle}</span>
                            <span className="text-[10px] text-gray-400">Week {weekNumber} · {monthEventCount} events</span>
                        </div>

                        <div className="flex-1" />

                        {/* View tabs */}
                        <div className="flex items-center gap-1 bg-white rounded-lg p-1 shrink-0 border border-gray-200">
                            <ViewTab active={view === "month"} onClick={() => setView("month")} label="Month" />
                            <ViewTab active={view === "week"}  onClick={() => setView("week")}  label="Week" />
                            <ViewTab active={view === "day"}   onClick={() => setView("day")}   label="Day" />
                            <ViewTab active={view === "agenda"} onClick={() => setView("agenda")} label="Agenda" />
                        </div>

                        {/* New event */}
                        <Button
                            onClick={() => tryOpenCreate(new Date())}
                            disabled={!canCreateEvents()}
                            showBlockedFeedback={!canCreateEvents()}
                            blockedPermission="create_events"
                            blockedReason="No tienes permiso para crear eventos."
                            title={canCreateEvents() ? t("calendar.newEvent") : t("chat.noPermission")}
                            className="h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg gap-1.5 shrink-0"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">New event</span>
                        </Button>
                    </div>

                    {/* Search + filters */}
                    <div className="flex items-center gap-2 px-4 pb-3 sm:px-5">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search events, attendees…"
                                className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
                            />
                            {q && (
                                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                                    <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {(["all", "mine", "team", "external"] as const).map((f) => (
                                <FilterChip
                                    key={f}
                                    active={activeFilter === f}
                                    onClick={() => setActiveFilter(f)}
                                    label={f === "all" ? "All" : f === "mine" ? "Mine" : f === "team" ? "Team" : "External"}
                                />
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {([
                                { id: "all", label: "All types" },
                                { id: "meeting", label: "Meetings" },
                                { id: "deadline", label: "Deadlines" },
                                { id: "personal", label: "Personal" },
                                { id: "allDay", label: "All-day" },
                            ] as { id: EventKind; label: string }[]).map((f) => (
                                <FilterChip
                                    key={f.id}
                                    active={eventKind === f.id}
                                    onClick={() => setEventKind(f.id)}
                                    label={f.label}
                                />
                            ))}
                        </div>
                        {q.trim() && (
                            <span className="text-[11px] text-gray-400 ml-1">
                                {filteredEvents.length} results
                            </span>
                        )}
                    </div>
                </header>

                {/* ── BODY ────────────────────────────────────────────────── */}
                <div ref={bodyRef} className="flex-1 overflow-y-auto">
                    <div className="flex gap-3 p-4 sm:p-5 min-h-full">

                        {/* ── MAIN CALENDAR ─────────────────────────────── */}
                        <div className="flex-1 min-w-0">
                            {/* Professional summary strip */}
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 mb-3">
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">This month</p>
                                    <p className="text-xl font-bold text-gray-900 leading-tight">{monthEventCount}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Today</p>
                                    <p className="text-xl font-bold text-violet-700 leading-tight">{todayCount}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">All day</p>
                                    <p className="text-xl font-bold text-amber-600 leading-tight">{allDayCount}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Upcoming</p>
                                    <p className="text-xl font-bold text-emerald-700 leading-tight">{upcomingCount}</p>
                                </div>
                            </div>

                            {/* Loading */}
                            {loading && (
                                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-24 border-b border-gray-100 animate-pulse bg-gray-50" />
                                    ))}
                                </div>
                            )}

                            {/* No results */}
                            {!loading && filteredEvents.length === 0 && q.trim() && (
                                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                                    <Search className="w-10 h-10 mb-3 opacity-20" />
                                    <p className="text-sm">No results for "{q}"</p>
                                    <button onClick={() => setQ("")} className="mt-2 text-xs text-violet-600 hover:underline">Clear search</button>
                                </div>
                            )}

                            {/* ── MONTH VIEW ──────────────────────────── */}
                            {!loading && view === "month" && (
                                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                    {/* Day names */}
                                    <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
                                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                                            <div
                                                key={d}
                                                className={cn(
                                                    "py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest",
                                                    i >= 5 ? "text-rose-400" : "text-gray-400"
                                                )}
                                            >
                                                {d}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Grid */}
                                    <div className="grid grid-cols-7">
                                        {calendarDays.map((day) => {
                                            const dayKey      = format(day, "yyyy-MM-dd");
                                            const dayEvents   = eventsByDay.get(dayKey) || [];
                                            const isCurrent   = isSameMonth(day, currentDate);
                                            const moreCount   = dayEvents.length > 3 ? dayEvents.length - 3 : 0;
                                            const dow         = day.getDay();
                                            const isWeekend   = dow === 0 || dow === 6;
                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    onClick={() => tryOpenCreate(day)}
                                                    className={cn(
                                                        "min-h-[100px] lg:min-h-[110px] border-b border-r border-gray-100 p-1.5 transition-colors",
                                                        !isCurrent && "bg-gray-50/60",
                                                        isCurrent && !isWeekend && "bg-white",
                                                        isCurrent && isWeekend && "bg-gray-50/40",
                                                        canCreateEvents() ? "cursor-pointer hover:bg-violet-50/40" : "cursor-default"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className={cn(
                                                            "h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium",
                                                            isToday(day) ? "bg-violet-600 text-white" : isCurrent ? (isWeekend ? "text-rose-400" : "text-gray-700") : "text-gray-300"
                                                        )}>
                                                            {format(day, "d")}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        {dayEvents.slice(0, 3).map((ev) => {
                                                            const color = evColor(ev.color);
                                                            const style = EV_STYLES[color];
                                                            return (
                                                                <button
                                                                    key={ev.id}
                                                                    onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                                                                    className={cn(
                                                                        "w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded border-l-2 truncate flex items-center gap-1 transition-opacity hover:opacity-75",
                                                                        style.bg, style.border, style.text
                                                                    )}
                                                                >
                                                                    {!ev.allDay && (
                                                                        <span className="opacity-60 shrink-0 font-normal">
                                                                            {format(parseISO(ev.startDate), "HH:mm")}
                                                                        </span>
                                                                    )}
                                                                    <span className="truncate">{ev.title}</span>
                                                                </button>
                                                            );
                                                        })}
                                                        {moreCount > 0 && (
                                                            <div className="text-[10px] text-gray-400 pl-1 pt-0.5">+{moreCount} more</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── WEEK VIEW ───────────────────────────── */}
                            {!loading && view === "week" && (
                                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                    {/* Week header */}
                                    <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "52px repeat(7,1fr)" }}>
                                        <div className="border-r border-gray-100 bg-gray-50" />
                                        {weekDays.map((day, i) => {
                                            const dow = day.getDay();
                                            const isWknd = dow === 0 || dow === 6;
                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    className={cn(
                                                        "py-2.5 text-center border-r border-gray-100 last:border-r-0 cursor-pointer",
                                                        isToday(day) ? "bg-violet-50" : "bg-gray-50",
                                                        "hover:bg-gray-100 transition-colors"
                                                    )}
                                                    onClick={() => { setCurrentDate(day); setView("day"); }}
                                                >
                                                    <div className={cn("text-[10px] font-semibold uppercase tracking-wider", isWknd ? "text-rose-400" : "text-gray-400")}>
                                                        {format(day, "EEE", { locale: dateLocale })}
                                                    </div>
                                                    <div className={cn(
                                                        "mt-1 h-7 w-7 rounded-full flex items-center justify-center text-sm font-semibold mx-auto",
                                                        isToday(day) ? "bg-violet-600 text-white" : isWknd ? "text-rose-500" : "text-gray-700"
                                                    )}>
                                                        {format(day, "d")}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Time grid */}
                                    <div ref={weekScrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
                                        <div className="grid" style={{ gridTemplateColumns: "52px repeat(7,1fr)" }}>
                                            {/* Hour labels */}
                                            <div className="border-r border-gray-100">
                                                {Array.from({ length: 24 }).map((_, h) => (
                                                    <div key={h} className="h-11 border-b border-gray-50 flex items-start pt-1 pr-2 justify-end">
                                                        <span className="text-[10px] text-gray-300">{String(h).padStart(2, "0")}:00</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Day columns */}
                                            {weekDays.map((day) => {
                                                const dayKey   = format(day, "yyyy-MM-dd");
                                                const dayEvs   = (eventsByDay.get(dayKey) || []).filter((e) => !e.allDay);
                                                return (
                                                    <div key={dayKey} className="relative border-r border-gray-100 last:border-r-0">
                                                        {Array.from({ length: 24 }).map((_, h) => (
                                                            <div
                                                                key={h}
                                                                className="h-11 border-b border-gray-50 hover:bg-violet-50/30 transition-colors cursor-pointer"
                                                                onClick={() => tryOpenCreate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h))}
                                                            />
                                                        ))}
                                                        {dayEvs.map((ev) => {
                                                            const start = parseISO(ev.startDate);
                                                            const end   = ev.endDate ? parseISO(ev.endDate) : addHours(start, 1);
                                                            const top   = (start.getHours() * 60 + start.getMinutes()) / 60 * 44;
                                                            const dur   = Math.max((end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes()), 30);
                                                            const color = evColor(ev.color);
                                                            const style = EV_STYLES[color];
                                                            return (
                                                                <button
                                                                    key={ev.id}
                                                                    onClick={() => handleEventClick(ev)}
                                                                    className={cn(
                                                                        "absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-left border-l-2 overflow-hidden hover:opacity-75 transition-opacity z-10",
                                                                        style.bg, style.border, style.text
                                                                    )}
                                                                    style={{ top: `${top}px`, height: `${Math.max(dur / 60 * 44, 20)}px` }}
                                                                >
                                                                    <div className="text-[10px] font-medium truncate">{ev.title}</div>
                                                                    <div className="text-[9px] opacity-60">{format(start, "HH:mm")}</div>
                                                                </button>
                                                            );
                                                        })}
                                                        {isToday(day) && (() => {
                                                            const now = new Date();
                                                            const topPx = (now.getHours() * 60 + now.getMinutes()) / 60 * 44;
                                                            return (
                                                                <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: `${topPx}px` }}>
                                                                    <div className="relative border-t border-rose-500">
                                                                        <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-rose-500" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── DAY VIEW ────────────────────────────── */}
                            {!loading && view === "day" && (
                                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-4">
                                        <div className={cn(
                                            "h-10 w-10 rounded-full flex items-center justify-center text-xl font-bold",
                                            isToday(currentDate) ? "bg-violet-600 text-white" : "bg-gray-200 text-gray-700"
                                        )}>
                                            {format(currentDate, "d")}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {format(currentDate, "EEEE", { locale: dateLocale })}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {format(currentDate, "MMMM yyyy", { locale: dateLocale })} ·{" "}
                                                {(eventsByDay.get(format(currentDate, "yyyy-MM-dd")) || []).length} events
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
                                        <div className="grid" style={{ gridTemplateColumns: "52px 1fr" }}>
                                            <div className="border-r border-gray-100">
                                                {Array.from({ length: 24 }).map((_, h) => (
                                                    <div key={h} className="h-14 border-b border-gray-50 flex items-start pt-1.5 pr-2 justify-end">
                                                        <span className="text-[10px] text-gray-300">{String(h).padStart(2, "0")}:00</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="relative">
                                                {Array.from({ length: 24 }).map((_, h) => (
                                                    <div
                                                        key={h}
                                                        className="h-14 border-b border-gray-50 hover:bg-violet-50/30 transition-colors cursor-pointer"
                                                        onClick={() => tryOpenCreate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), h))}
                                                    />
                                                ))}

                                                {(eventsByDay.get(format(currentDate, "yyyy-MM-dd")) || []).map((ev) => {
                                                    if (ev.allDay) return null;
                                                    const start  = parseISO(ev.startDate);
                                                    const end    = ev.endDate ? parseISO(ev.endDate) : addHours(start, 1);
                                                    const top    = (start.getHours() * 60 + start.getMinutes()) / 60 * 56;
                                                    const dur    = Math.max((end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes()), 30);
                                                    const color  = evColor(ev.color);
                                                    const style  = EV_STYLES[color];
                                                    return (
                                                        <button
                                                            key={ev.id}
                                                            onClick={() => handleEventClick(ev)}
                                                            className={cn(
                                                                "absolute left-2 right-2 rounded-md px-3 py-1.5 text-left border-l-2 overflow-hidden hover:opacity-80 transition-opacity z-10",
                                                                style.bg, style.border, style.text
                                                            )}
                                                            style={{ top: `${top}px`, height: `${Math.max(dur / 60 * 56, 28)}px` }}
                                                        >
                                                            <div className="text-xs font-semibold truncate">{ev.title}</div>
                                                            <div className="text-[10px] opacity-60">
                                                                {format(start, "HH:mm")} – {format(end, "HH:mm")}
                                                            </div>
                                                        </button>
                                                    );
                                                })}

                                                {isToday(currentDate) && (() => {
                                                    const now  = new Date();
                                                    const topPx = (now.getHours() * 60 + now.getMinutes()) / 60 * 56;
                                                    return (
                                                        <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: `${topPx}px` }}>
                                                            <div className="relative border-t-2 border-rose-500">
                                                                <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-rose-500" />
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── AGENDA VIEW ───────────────────────────── */}
                            {!loading && view === "agenda" && (
                                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-100 bg-white">
                                        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
                                            Timeline
                                        </p>
                                        <p className="text-sm text-gray-600 mt-0.5">
                                            Próximos eventos ordenados por fecha y hora
                                        </p>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {upcomingEvents.length === 0 && (
                                            <div className="p-8 text-sm text-gray-400">No hay eventos próximos.</div>
                                        )}
                                        {upcomingEvents.map((ev) => {
                                            const color = evColor(ev.color);
                                            const start = parseISO(ev.startDate);
                                            const end = ev.endDate ? parseISO(ev.endDate) : null;
                                            const durationMinutes =
                                                end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null;
                                            return (
                                                <button
                                                    key={ev.id}
                                                    onClick={() => handleEventClick(ev)}
                                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="pt-1">
                                                            <span
                                                                className="inline-block w-2.5 h-2.5 rounded-full"
                                                                style={{ backgroundColor: DOT_COLORS[color] }}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                                                                <span className="text-xs text-gray-400 shrink-0">
                                                                    {format(start, "dd MMM yyyy", { locale: dateLocale })}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {ev.allDay
                                                                    ? "All day"
                                                                    : `${format(start, "HH:mm")}${end ? ` - ${format(end, "HH:mm")}` : ""}`}
                                                                {ev.owner?.displayName ? ` · ${ev.owner.displayName}` : ""}
                                                            </p>
                                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                                                                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 border border-gray-200">
                                                                    {classifyEvent(ev)}
                                                                </span>
                                                                {durationMinutes !== null ? (
                                                                    <span>{durationMinutes} min</span>
                                                                ) : null}
                                                                {typeof ev.reminderMinutes === "number" ? (
                                                                    <span>Reminder {ev.reminderMinutes}m</span>
                                                                ) : null}
                                                            </div>
                                                            {ev.description ? (
                                                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ev.description}</p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── SIDE PANEL ──────────────────────────────────── */}
                        <aside className="hidden lg:flex flex-col gap-3 w-60 shrink-0">

                            {/* Mini calendar */}
                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="flex items-center justify-between mb-3">
                                    <button
                                        onClick={() => setMiniDate(subMonths(miniDate, 1))}
                                        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                    <span className="text-xs font-semibold text-gray-700">
                                        {MONTHS[miniDate.getMonth()].slice(0, 3)} {miniDate.getFullYear()}
                                    </span>
                                    <button
                                        onClick={() => setMiniDate(addMonths(miniDate, 1))}
                                        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-7 mb-1">
                                    {["M","T","W","T","F","S","S"].map((d, i) => (
                                        <div key={i} className={cn("text-center text-[9px] font-medium py-0.5", i >= 5 ? "text-rose-300" : "text-gray-300")}>
                                            {d}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-y-0.5">
                                    {miniCalDays.map((day, i) => {
                                        const inMonth  = isSameMonth(day, miniDate);
                                        const selected = isSameDay(day, currentDate);
                                        const hasEv    = eventsByDay.has(format(day, "yyyy-MM-dd"));
                                        const dow      = day.getDay();
                                        const isWknd   = dow === 0 || dow === 6;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => { setCurrentDate(new Date(day)); setMiniDate(new Date(day)); }}
                                                className={cn(
                                                    "h-6 w-6 rounded-full flex items-center justify-center text-[10px] relative mx-auto transition-colors",
                                                    !inMonth && "text-gray-200",
                                                    inMonth && !selected && !isToday(day) && (isWknd ? "text-rose-400 hover:bg-rose-50" : "text-gray-600 hover:bg-gray-100"),
                                                    isToday(day) && !selected && "text-violet-600 font-semibold",
                                                    selected && "bg-violet-600 text-white font-semibold"
                                                )}
                                            >
                                                {format(day, "d")}
                                                {hasEv && !selected && inMonth && (
                                                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-400" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Selected event detail */}
                            <AnimatePresence>
                                {selectedEvent && (
                                    <motion.div
                                        key="detail"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 6 }}
                                        transition={{ duration: 0.15 }}
                                        className="rounded-xl border border-gray-200 bg-white p-3 overflow-hidden"
                                    >
                                        {/* Color accent bar */}
                                        <div
                                            className="h-0.5 -mx-3 -mt-3 mb-3 rounded-t-xl"
                                            style={{ background: DOT_COLORS[evColor(selectedEvent.color)] }}
                                        />

                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h3 className="text-xs font-semibold text-gray-900 leading-snug">{selectedEvent.title}</h3>
                                            <button
                                                onClick={() => setSelectedEvent(null)}
                                                className="p-0.5 rounded hover:bg-gray-100 shrink-0 transition-colors"
                                            >
                                                <X className="w-3 h-3 text-gray-400" />
                                            </button>
                                        </div>

                                        <div className="space-y-1.5 mb-3">
                                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                <CalendarDays className="w-3 h-3 text-gray-300 shrink-0" />
                                                <span>{format(parseISO(selectedEvent.startDate), "EEE, d MMM yyyy", { locale: dateLocale })}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                                                <span>
                                                    {selectedEvent.allDay
                                                        ? "All day"
                                                        : `${format(parseISO(selectedEvent.startDate), "HH:mm")}${selectedEvent.endDate ? ` – ${format(parseISO(selectedEvent.endDate), "HH:mm")}` : ""}`}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                <span className="inline-flex px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200">
                                                    {classifyEvent(selectedEvent)}
                                                </span>
                                                {typeof selectedEvent.reminderMinutes === "number" ? (
                                                    <span>Reminder {selectedEvent.reminderMinutes}m</span>
                                                ) : (
                                                    <span>No reminder</span>
                                                )}
                                            </div>
                                            {selectedEvent.owner && (
                                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                    <Users className="w-3 h-3 text-gray-300 shrink-0" />
                                                    <span className="truncate">{selectedEvent.owner.displayName}</span>
                                                </div>
                                            )}
                                            {selectedEvent.description && (
                                                <div className="pt-1.5 mt-1.5 border-t border-gray-100 text-[11px] text-gray-500 line-clamp-3">
                                                    {selectedEvent.description}
                                                </div>
                                            )}
                                        </div>

                                        {canEditEvents() && (
                                            <button
                                                onClick={(e) => handleOpenEdit(e, selectedEvent)}
                                                className="w-full h-7 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 transition-colors"
                                            >
                                                Edit event
                                            </button>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Upcoming events */}
                            {!selectedEvent && (
                                <div className="rounded-xl border border-gray-200 bg-white p-3">
                                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Upcoming</div>
                                    <div className="space-y-0">
                                        {upcomingEvents.length === 0 && (
                                            <p className="text-[11px] text-gray-400 py-2">No upcoming events</p>
                                        )}
                                        {upcomingEvents.map((ev) => {
                                            const color = evColor(ev.color);
                                            const d = parseISO(ev.startDate);
                                            return (
                                                <button
                                                    key={ev.id}
                                                    onClick={() => handleEventClick(ev)}
                                                    className="w-full flex items-start gap-2 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-1 px-1 rounded transition-colors text-left"
                                                >
                                                    <div
                                                        className="mt-1 w-2 h-2 rounded-full shrink-0"
                                                        style={{ background: DOT_COLORS[color] }}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-medium text-gray-800 truncate">{ev.title}</div>
                                                        <div className="text-[10px] text-gray-400">
                                                            {format(d, "MMM d")}
                                                            {!ev.allDay && ` · ${format(d, "HH:mm")}`}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </aside>
                    </div>
                </div>

                {/* ── MOBILE: event detail sheet ───────────────────────── */}
                <AnimatePresence>
                    {selectedEvent && (
                        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40"
                                onClick={() => setSelectedEvent(null)}
                            />
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                                className="relative bg-white rounded-t-2xl w-full max-w-md p-5 pb-8"
                            >
                                {/* Drag handle */}
                                <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />

                                {/* Accent line */}
                                <div
                                    className="h-0.5 rounded-full mb-4"
                                    style={{ background: DOT_COLORS[evColor(selectedEvent.color)] }}
                                />

                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <h2 className="text-base font-semibold text-gray-900">{selectedEvent.title}</h2>
                                    <button onClick={() => setSelectedEvent(null)} className="p-1 rounded-lg hover:bg-gray-100">
                                        <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                </div>

                                <div className="space-y-3 mb-5">
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                                        <span>{format(parseISO(selectedEvent.startDate), "EEEE, d MMMM yyyy", { locale: dateLocale })}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                                        <span>
                                            {selectedEvent.allDay
                                                ? "All day"
                                                : `${format(parseISO(selectedEvent.startDate), "HH:mm")}${selectedEvent.endDate ? ` – ${format(parseISO(selectedEvent.endDate), "HH:mm")}` : ""}`}
                                        </span>
                                    </div>
                                    {selectedEvent.owner && (
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            <Users className="w-4 h-4 text-gray-400 shrink-0" />
                                            <span>{selectedEvent.owner.displayName}</span>
                                        </div>
                                    )}
                                    {selectedEvent.description && (
                                        <div className="text-sm text-gray-500 pt-3 border-t border-gray-100">
                                            {selectedEvent.description}
                                        </div>
                                    )}
                                </div>

                                {canEditEvents() && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => handleOpenEdit(e as unknown as React.MouseEvent, selectedEvent)}
                                            className="flex-1 h-10 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                                        >
                                            Edit event
                                        </button>
                                        <button
                                            onClick={() => setSelectedEvent(null)}
                                            className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                        >
                                            Close
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

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