"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { 
    FileText, Calendar, StickyNote, HardDrive, Folder, 
    ArrowRight, Plus, Link as LinkIcon, Zap, Activity,
    MessageSquare, Image, Video, BarChart3, Clock, Bell,
    Users, Settings, File, ChevronRight, Star, TrendingUp, Upload
} from "lucide-react";
import { format, isToday, isTomorrow, startOfDay, differenceInDays, addDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "framer-motion";

interface CalendarEvent {
    id: string;
    title: string;
    startDate: string;
    endDate: string | null;
    allDay: boolean;
    color: string;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function HomePage() {
    const { user } = useAuth();
    const { t, locale } = useTranslation();
    const dateLocale = locale === 'es' ? es : enUS;
    
    const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
    const [recentFiles, setRecentFiles] = useState<any[]>([]);
    const [storageUsed, setStorageUsed] = useState(0);
    const [storageLimit, setStorageLimit] = useState(53687091200);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ files: 0, documents: 0, notes: 0, links: 0 });

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return t("home.morning");
        if (hour >= 12 && hour < 20) return t("home.afternoon");
        return t("home.night");
    };

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        
        // Helper to extract data from API response
        const extractData = (res: any) => {
            if (Array.isArray(res.data)) return res.data;
            if (res.data && Array.isArray(res.data.data)) return res.data.data;
            return [];
        };
        
        try {
            const [eventsRes, usageRes, filesRes, docsRes, notesRes, linksRes] = await Promise.all([
                axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                    params: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
                    withCredentials: true
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true }).catch(() => ({ data: { used: 0, limit: 53687091200 } })),
                axios.get(API_ENDPOINTS.FILES.BASE, { params: { limit: 6 }, withCredentials: true }).catch(() => ({ data: { data: [] } })),
                axios.get(API_ENDPOINTS.DOCUMENTS.BASE, { params: { limit: 6 }, withCredentials: true }).catch(() => ({ data: { data: [] } })),
                axios.get(API_ENDPOINTS.NOTES.BASE, { params: { limit: 6 }, withCredentials: true }).catch(() => ({ data: { data: [] } })),
                axios.get(API_ENDPOINTS.LINKS.BASE, { params: { limit: 6 }, withCredentials: true }).catch(() => ({ data: [] })),
            ]);

            const files = extractData(filesRes);
            const documents = extractData(docsRes);
            const notes = extractData(notesRes);

            const now = startOfDay(new Date());
            const nextWeek = addDays(now, 7);
            
            const upcoming = eventsRes.data
                .filter((e: CalendarEvent) => startOfDay(new Date(e.startDate)) >= now && startOfDay(new Date(e.startDate)) <= nextWeek)
                .sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                .slice(0, 4);

            setUpcomingEvents(upcoming);
            setRecentFiles(files || []);
            setStorageUsed(Number(usageRes.data.used || 0));
            setStorageLimit(Number(usageRes.data.limit || 53687091200));
            setStats({
                files: files?.length || 0,
                documents: documents?.length || 0,
                notes: notes?.length || 0,
                links: linksRes.data?.length || 0,
            });
        } catch (err) {
            console.error("Failed to fetch home data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

    const storagePercent = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
    const isCritical = storagePercent > 90;
    const isWarning = storagePercent > 70;

    const getEventDateLabel = (date: string) => {
        const eventDate = startOfDay(new Date(date));
        const today = startOfDay(new Date());
        if (isToday(eventDate)) return t("calendar.today");
        if (isTomorrow(eventDate)) return t("common.next");
        const daysDiff = differenceInDays(eventDate, today);
        if (daysDiff <= 7) return format(eventDate, "EEE d", { locale: dateLocale });
        return format(eventDate, "d MMM", { locale: dateLocale });
    };

    const quickActions = [
        { icon: Upload, label: t("files.upload"), href: "/dashboard/files", color: "bg-blue-500", permission: true },
        { icon: FileText, label: t("nav.documents"), href: "/dashboard/documents", color: "bg-purple-500", permission: user?.permissions?.includes('view_documents') || user?.isAdmin },
        { icon: StickyNote, label: t("nav.notes"), href: "/dashboard/notes", color: "bg-yellow-500", permission: user?.permissions?.includes('view_notes') || user?.isAdmin },
        { icon: Calendar, label: t("nav.calendar"), href: "/dashboard/calendar", color: "bg-green-500", permission: user?.permissions?.includes('view_calendar') || user?.isAdmin },
        { icon: LinkIcon, label: t("nav.shared"), href: "/dashboard/links", color: "bg-pink-500", permission: user?.permissions?.includes('view_links') || user?.isAdmin },
        { icon: MessageSquare, label: t("nav.chat"), href: "/dashboard/chat", color: "bg-orange-500", permission: user?.permissions?.includes('view_chat') || user?.isAdmin },
    ].filter(a => a.permission);

    const statCards = [
        { label: t("nav.files"), value: stats.files, icon: Folder, color: "from-blue-500 to-blue-600", href: "/dashboard/files" },
        { label: t("nav.documents"), value: stats.documents, icon: FileText, color: "from-purple-500 to-purple-600", href: "/dashboard/documents" },
        { label: t("nav.notes"), value: stats.notes, icon: StickyNote, color: "from-yellow-500 to-yellow-600", href: "/dashboard/notes" },
        { label: t("nav.shared"), value: stats.links, icon: LinkIcon, color: "from-pink-500 to-pink-600", href: "/dashboard/links" },
    ];

    const getFileIcon = (mimeType: string) => {
        if (mimeType?.includes('image')) return Image;
        if (mimeType?.includes('video')) return Video;
        if (mimeType?.includes('pdf') || mimeType?.includes('document')) return FileText;
        return File;
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-20 bg-muted/40 rounded-2xl animate-pulse" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted/40 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-foreground">
                            {getGreeting()}, <span className="text-primary">{user?.displayName || user?.username}</span>
                        </h1>
                        <p className="text-muted-foreground mt-2 flex items-center gap-3">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(), "EEEE, d MMMM yyyy", { locale: dateLocale })}
                            <span className="mx-2">•</span>
                            <Clock className="w-4 h-4" />
                            {format(new Date(), "HH:mm")}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/files" className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/25">
                            <Plus className="w-5 h-5" />
                            {t("files.upload")}
                        </Link>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {quickActions.map((action, i) => (
                    <Link key={i} href={action.href}>
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group bg-background border border-border/60 rounded-2xl p-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all"
                        >
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", action.color, "text-white")}>
                                <action.icon className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{action.label}</p>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                    <Link key={i} href={stat.href}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-background border border-border/60 rounded-2xl p-5 hover:border-primary/30 hover:shadow-lg transition-all group"
                        >
                            <div className={cn("w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-4 shadow-lg", stat.color, "text-white")}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <p className="text-3xl font-black text-foreground">{stat.value}</p>
                            <p className="text-sm text-muted-foreground font-medium mt-1 group-hover:text-primary transition-colors">{stat.label}</p>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Upcoming Events */}
                <div className="lg:col-span-2 bg-background border border-border/60 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{t("home.upcomingEvents")}</h2>
                                <p className="text-xs text-muted-foreground">{t("home.thisWeek")}</p>
                            </div>
                        </div>
                        <Link href="/dashboard/calendar" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                            {t("common.viewAll")} <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {upcomingEvents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">{t("home.noEvents")}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {upcomingEvents.map((event, i) => (
                                <motion.div 
                                    key={event.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                                >
                                    <div className={cn("w-1 h-12 rounded-full", event.color || "bg-purple-500")} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-foreground truncate">{event.title}</p>
                                        <p className="text-xs text-muted-foreground">{getEventDateLabel(event.startDate)}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Storage */}
                <div className="bg-background border border-border/60 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <HardDrive className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">{t("nav.storage")}</h2>
                            <p className="text-xs text-muted-foreground">{t("home.usage")}</p>
                        </div>
                    </div>

                    <div className="relative pt-8">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-3xl font-black text-foreground">{formatBytes(storageUsed)}</span>
                            <span className="text-sm text-muted-foreground">/ {formatBytes(storageLimit)}</span>
                        </div>
                        <div className="h-4 bg-muted/50 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${storagePercent}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={cn(
                                    "h-full rounded-full",
                                    isCritical ? "bg-gradient-to-r from-red-500 to-red-600" : 
                                    isWarning ? "bg-gradient-to-r from-amber-500 to-amber-600" : 
                                    "bg-gradient-to-r from-blue-500 to-primary"
                                )}
                            />
                        </div>
                        <p className="text-sm font-bold text-muted-foreground mt-3">
                            {Math.round(storagePercent)}% {t("home.utilized")}
                        </p>
                    </div>

                    {isWarning && (
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                            <Bell className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                {isCritical ? t("home.storageCritical") : t("home.storageWarning")}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Recent Files */}
            <div className="bg-background border border-border/60 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Folder className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">{t("home.recentFiles")}</h2>
                            <p className="text-xs text-muted-foreground">{t("home.lastActivity")}</p>
                        </div>
                    </div>
                    <Link href="/dashboard/files" className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
                        {t("common.viewAll")} <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                {recentFiles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">{t("home.noFiles")}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {recentFiles.slice(0, 6).map((file, i) => {
                            const FileIcon = getFileIcon(file.mimeType);
                            return (
                                <motion.div 
                                    key={file.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="group p-4 border border-border/40 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
                                >
                                    <FileIcon className="w-8 h-8 text-muted-foreground mb-2 group-hover:text-primary transition-colors" />
                                    <p className="text-sm font-medium text-foreground truncate">{file.originalName}</p>
                                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick Links for Admin */}
            {user?.isAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link href="/dashboard/settings/team">
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-5 hover:border-indigo-500/40 transition-all"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-indigo-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{t("settings.team")}</h3>
                                    <p className="text-sm text-muted-foreground">{t("settings.manageTeam")}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto" />
                            </div>
                        </motion.div>
                    </Link>
                    <Link href="/dashboard/statistics">
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-5 hover:border-cyan-500/40 transition-all"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                    <BarChart3 className="w-6 h-6 text-cyan-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{t("nav.statistics")}</h3>
                                    <p className="text-sm text-muted-foreground">{t("statistics.overview")}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto" />
                            </div>
                        </motion.div>
                    </Link>
                </div>
            )}
        </div>
    );
}
