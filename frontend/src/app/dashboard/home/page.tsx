"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import {
    FileText, Calendar, StickyNote, HardDrive, Folder,
    Link as LinkIcon, Activity, Image, Video, BarChart3,
    Clock, Users, File, ChevronRight, Upload
} from "lucide-react";
import {
    format, isToday, isTomorrow, startOfDay,
    differenceInDays, addDays, formatDistanceToNow
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "framer-motion";

/* ─── types ─────────────────────────────────────────────── */
interface CalendarEvent {
    id: string; title: string; startDate: string;
    endDate: string | null; allDay: boolean; color: string;
}
interface ActivityItem {
    id: string; type: string; action: string;
    resourceName?: string; createdAt: string;
}

/* ─── helpers ────────────────────────────────────────────── */
function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) return "∞";
    if (bytes === 0) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/* ─── component ──────────────────────────────────────────── */
export default function HomePage() {
    const { user } = useAuth();
    const { t, locale } = useTranslation();
    const dateLocale = locale === "es" ? es : enUS;

    const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
    const [recentFiles, setRecentFiles]       = useState<any[]>([]);
    const [recentNotes, setRecentNotes]       = useState<any[]>([]);
    const [activities, setActivities]         = useState<ActivityItem[]>([]);
    const [storageUsed, setStorageUsed]       = useState(0);
    const [storageLimit, setStorageLimit]     = useState<number>(Number.POSITIVE_INFINITY);
    const [loading, setLoading]               = useState(true);

    const hasPerm = (p: string) => user?.permissions?.includes(p) || user?.isAdmin;

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return t("home.morning")  || "Good morning";
        if (h >= 12 && h < 20) return t("home.afternoon") || "Good afternoon";
        return t("home.night") || "Good evening";
    };

    /* fetch ------------------------------------------------ */
    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const extract = (res: any): any[] => {
            if (!res) return [];
            if (Array.isArray(res.data)) return res.data;
            if (Array.isArray(res.data?.data)) return res.data.data;
            return [];
        };

        const reqs: Promise<any>[] = [
            axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true }).catch(() => ({ data: { used: 0, limit: null } })),
            axios.get(API_ENDPOINTS.FILES.BASE,  { params: { limit: 8 }, withCredentials: true }).catch(() => ({ data: [] })),
            hasPerm("view_calendar")
                ? axios.get(API_ENDPOINTS.CALENDAR.BASE, { params: { month: new Date().getMonth() + 1, year: new Date().getFullYear() }, withCredentials: true }).catch(() => ({ data: [] }))
                : Promise.resolve(null),
            hasPerm("view_notes")
                ? axios.get(API_ENDPOINTS.NOTES.BASE, { params: { limit: 6 }, withCredentials: true }).catch(() => ({ data: [] }))
                : Promise.resolve(null),
            axios.get(API_ENDPOINTS.ACTIVITY.BASE, { params: { limit: 8 }, withCredentials: true }).catch(() => ({ data: [] })),
        ];

        Promise.all(reqs).then(([usageRes, filesRes, eventsRes, notesRes, actRes]) => {
            setStorageUsed(Number(usageRes?.data?.used || 0));
            setStorageLimit(
                usageRes?.data?.limit == null
                    ? Number.POSITIVE_INFINITY
                    : Number(usageRes.data.limit)
            );
            setRecentFiles(extract(filesRes).slice(0, 8));

            if (eventsRes) {
                const now = startOfDay(new Date());
                const next7 = addDays(now, 7);
                setUpcomingEvents(
                    extract(eventsRes)
                        .filter((e: CalendarEvent) => {
                            const d = startOfDay(new Date(e.startDate));
                            return d >= now && d <= next7;
                        })
                        .sort((a: CalendarEvent, b: CalendarEvent) =>
                            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                        )
                        .slice(0, 5)
                );
            }
            if (notesRes) setRecentNotes(extract(notesRes).slice(0, 6));
            setActivities(extract(actRes).slice(0, 8));
        }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    /* derived ---------------------------------------------- */
    const storagePercent = Number.isFinite(storageLimit) && storageLimit > 0
        ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
    const isCritical = storagePercent > 90;
    const isWarning  = storagePercent > 70;

    const getEventLabel = (date: string) => {
        const d = startOfDay(new Date(date));
        const today = startOfDay(new Date());
        if (isToday(d))    return t("calendar.today") || "Today";
        if (isTomorrow(d)) return t("common.next")    || "Tomorrow";
        if (differenceInDays(d, today) <= 7) return format(d, "EEE d", { locale: dateLocale });
        return format(d, "d MMM", { locale: dateLocale });
    };

    const getFileIcon = (mime: string) => {
        if (mime?.includes("image"))  return Image;
        if (mime?.includes("video"))  return Video;
        if (mime?.includes("pdf") || mime?.includes("document")) return FileText;
        return File;
    };

    const actionColor = (action: string) => {
        const a = action?.toLowerCase() || "";
        if (a.includes("create") || a.includes("upload")) return "text-green-500";
        if (a.includes("edit")   || a.includes("update")) return "text-blue-500";
        if (a.includes("delete") || a.includes("remove")) return "text-red-500";
        return "text-muted-foreground";
    };

    /* quick actions (role-aware) */
    const quickActions = [
        { icon: Upload,      label: t("files.upload") || "Upload",   href: "/dashboard/files",    show: true },
        { icon: StickyNote,  label: t("nav.notes")    || "Notes",    href: "/dashboard/notes",    show: hasPerm("view_notes") },
        { icon: Calendar,    label: t("nav.calendar") || "Calendar", href: "/dashboard/calendar", show: hasPerm("view_calendar") },
        { icon: LinkIcon,    label: t("nav.shared")   || "Links",    href: "/dashboard/links",    show: hasPerm("view_links") },
    ].filter(a => a.show);

    /* ── skeleton ── */
    if (loading) return (
        <div className="w-full max-w-[1400px] mx-auto px-4 space-y-8 pb-12">
            <div className="h-16 bg-muted/40 rounded-2xl animate-pulse" />
            <div className="grid grid-cols-3 gap-8">
                {[1,2,3].map(i => <div key={i} className="h-72 bg-muted/40 rounded-3xl animate-pulse" />)}
            </div>
            <div className="grid grid-cols-3 gap-8">
                {[1,2,3].map(i => <div key={i} className="h-56 bg-muted/40 rounded-3xl animate-pulse" />)}
            </div>
        </div>
    );

    /* ── render ── */
    return (
        <div className="w-full max-w-[1400px] mx-auto px-4 space-y-8 pb-12">

            {/* ── HEADER ─────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 flex-wrap">
                {/* Greeting */}
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">
                        {getGreeting()},{" "}
                        <span className="text-primary">{user?.displayName || user?.username}</span>
                    </h1>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1 font-medium">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(), "EEEE, d MMMM yyyy", { locale: dateLocale })}
                        <span className="opacity-40">•</span>
                        <Clock className="w-4 h-4" />
                        {format(new Date(), "HH:mm")}
                    </p>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-3 flex-wrap">
                    {quickActions.map((a, i) => (
                        <Link key={i} href={a.href}
                            className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border/60 hover:bg-muted/50 rounded-xl text-sm font-bold transition-all hover:shadow-sm">
                            <a.icon className="w-4 h-4 text-primary" />
                            {a.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* ── ROW 1: [Storage + Files (2 cols)] [Notes (1 col)] ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Storage + Files — span 2 */}
                <div className="md:col-span-2 flex flex-col gap-6">

                    {/* Storage compact bar */}
                    <div className="bg-card border border-border/40 rounded-3xl px-6 py-4 flex items-center gap-5 hover:shadow-sm transition-shadow">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                            <HardDrive className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-base font-bold text-foreground">{t("nav.storage") || "Storage"}</span>
                                <span className="text-sm font-medium text-muted-foreground">
                                    {formatBytes(storageUsed)} / {Number.isFinite(storageLimit) ? formatBytes(storageLimit) : "∞"}
                                    {" "}· <span className="text-foreground">{Math.round(storagePercent)}%</span>
                                </span>
                            </div>
                            <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${storagePercent}%` }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={cn("h-full rounded-full",
                                        isCritical ? "bg-red-500" :
                                        isWarning  ? "bg-amber-500" :
                                        "bg-gradient-to-r from-blue-500 to-indigo-500"
                                    )}
                                />
                            </div>
                        </div>
                        {isWarning && (
                            <span className={cn("text-sm font-bold shrink-0", isCritical ? "text-red-500" : "text-amber-500")}>
                                {isCritical ? "⚠ Critical" : "⚠ Warning"}
                            </span>
                        )}
                    </div>

                    {/* Recent Files */}
                    <div className="bg-card border border-border/40 rounded-3xl p-6 flex-1 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <Folder className="w-5 h-5 text-green-500" />
                                <span className="font-bold text-base text-foreground">{t("home.recentFiles") || "Recent Files"}</span>
                            </div>
                            <Link href="/dashboard/files" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                                {t("common.viewAll") || "View all"} <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="space-y-2">
                            {recentFiles.length === 0 ? (
                                <div className="py-10 text-center text-muted-foreground">
                                    <Folder className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">{t("home.noFiles") || "No recent files"}</p>
                                </div>
                            ) : (
                                recentFiles.map((f, i) => {
                                    const FI = getFileIcon(f.mimeType);
                                    return (
                                        <Link key={f.id} href={`/dashboard/files?focus=${f.id}`}>
                                            <motion.div
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.04 }}
                                                className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 border border-transparent hover:border-border/50 transition-all group"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                                                    <FI className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-base font-semibold truncate text-foreground">{f.originalName}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {formatBytes(f.size)}
                                                        {f.updatedAt ? ` · ${formatDistanceToNow(new Date(f.updatedAt))} ago` : ""}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

                {/* Notes — span 1 */}
                {hasPerm("view_notes") ? (
                    <div className="md:col-span-1 bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow flex flex-col">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <StickyNote className="w-5 h-5 text-yellow-500" />
                                <span className="font-bold text-base text-foreground">{t("nav.notes") || "Notes"}</span>
                            </div>
                            <Link href="/dashboard/notes" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                                {t("common.viewAll") || "View all"} <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            {recentNotes.length === 0 ? (
                                <div className="col-span-2 flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <StickyNote className="w-10 h-10 mb-3 opacity-30" />
                                    <p className="text-sm">No notes yet</p>
                                </div>
                            ) : (
                                recentNotes.map((n, i) => (
                                    <Link key={n.id} href="/dashboard/notes">
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.04 }}
                                            className="h-32 bg-muted/30 border border-border/40 hover:border-primary/40 rounded-2xl p-4 flex flex-col justify-between cursor-pointer hover:bg-muted/60 transition-all group"
                                        >
                                            <p className="text-sm font-bold line-clamp-3 group-hover:text-primary transition-colors">{n.title || "Untitled"}</p>
                                            <p className="text-xs font-medium text-muted-foreground mt-2">{formatDistanceToNow(new Date(n.updatedAt))} ago</p>
                                        </motion.div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    /* placeholder so layout stays 3-col even without notes perm */
                    <div className="md:col-span-1 bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow flex flex-col">
                        <div className="flex items-center gap-3 mb-5">
                            <Activity className="w-5 h-5 text-orange-500" />
                            <span className="font-bold text-base text-foreground">{t("activity.title") || "Activity"}</span>
                        </div>
                        <div className="space-y-4 flex-1">
                            {activities.slice(0, 5).map((act, i) => (
                                <div key={act.id} className="flex gap-4">
                                    <div className="relative mt-1.5 flex flex-col items-center">
                                        <div className="w-2 h-2 rounded-full bg-primary/50 ring-4 ring-background z-10" />
                                        {i !== Math.min(activities.length, 5) - 1 && <div className="absolute top-2 w-px h-full bg-border" />}
                                    </div>
                                    <div className="pb-4 flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            <span className={cn("capitalize mr-1.5", actionColor(act.action))}>{act.action}</span>
                                            {act.resourceName && <span className="font-bold">{act.resourceName}</span>}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(act.createdAt))} ago</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* ── ROW 2: [Activity] [Events] [Team+Stats] ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Activity Log */}
                <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <Activity className="w-5 h-5 text-orange-500" />
                            <span className="font-bold text-base text-foreground">{t("activity.title") || "Activity"}</span>
                        </div>
                        <Link href="/dashboard/activity" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                            {t("common.viewAll") || "View all"} <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="space-y-4">
                        {activities.length === 0 ? (
                            <div className="py-10 text-center text-muted-foreground">
                                <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">No recent activity</p>
                            </div>
                        ) : (
                            activities.map((act, i) => (
                                <div key={act.id} className="flex gap-4">
                                    <div className="relative mt-1.5 flex flex-col items-center">
                                        <div className="w-2 h-2 rounded-full bg-primary/50 ring-4 ring-background z-10" />
                                        {i !== activities.length - 1 && <div className="absolute top-2 w-px h-full bg-border" />}
                                    </div>
                                    <div className="pb-3.5 flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            <span className={cn("capitalize mr-1.5", actionColor(act.action))}>{act.action}</span>
                                            {act.resourceName && <span className="font-bold">{act.resourceName}</span>}
                                        </p>
                                        <p className="text-xs font-medium text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(act.createdAt))} ago</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Upcoming Events */}
                {hasPerm("view_calendar") ? (
                    <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-purple-500" />
                                <span className="font-bold text-base text-foreground">{t("home.upcomingEvents") || "Upcoming Events"}</span>
                            </div>
                            <Link href="/dashboard/calendar" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                                {t("common.viewAll") || "View all"} <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="space-y-3">
                            {upcomingEvents.length === 0 ? (
                                <div className="py-10 text-center text-muted-foreground">
                                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">{t("home.noEvents") || "Empty agenda"}</p>
                                </div>
                            ) : (
                                upcomingEvents.map((ev, i) => (
                                    <motion.div key={ev.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-border/40 hover:bg-muted/40 transition-colors">
                                        <div className={cn("w-1.5 h-10 rounded-full shrink-0", ev.color || "bg-purple-500")} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate">{ev.title}</p>
                                            <p className="text-xs font-medium text-muted-foreground mt-1">{getEventLabel(ev.startDate)}</p>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    /* Filler for users without calendar permission */
                    <div className="bg-muted/20 border border-dashed border-border/40 rounded-3xl p-6 flex items-center justify-center text-muted-foreground/40">
                        <p className="text-sm font-medium">Calendar not available</p>
                    </div>
                )}

                {/* Team + Statistics (admin only) or placeholder */}
                {user?.isAdmin ? (
                    <div className="flex flex-col gap-5">
                        <Link href="/dashboard/settings/team">
                            <div className="bg-gradient-to-r from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-3xl p-5 flex items-center justify-between group hover:border-indigo-500/40 transition-all hover:shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                                        <Users className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-foreground">{t("settings.team") || "Team"}</p>
                                        <p className="text-sm font-medium text-muted-foreground mt-0.5">Manage users & roles</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </Link>
                        <Link href="/dashboard/statistics">
                            <div className="bg-gradient-to-r from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 flex items-center justify-between group hover:border-cyan-500/40 transition-all hover:shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                        <BarChart3 className="w-5 h-5 text-cyan-500" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-foreground">{t("nav.statistics") || "Statistics"}</p>
                                        <p className="text-sm font-medium text-muted-foreground mt-0.5">Platform health & metrics</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </Link>
                    </div>
                ) : (
                    <div className="bg-muted/20 border border-dashed border-border/40 rounded-3xl p-6 flex items-center justify-center text-muted-foreground/40">
                        <p className="text-sm font-medium">No admin widgets</p>
                    </div>
                )}

            </div>
        </div>
    );
}
