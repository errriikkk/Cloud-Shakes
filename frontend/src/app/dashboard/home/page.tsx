"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { 
    FileText, Calendar, StickyNote, Clock, TrendingUp, 
    HardDrive, AlertCircle, CheckCircle2, File, Folder,
    ArrowRight, Plus, Link as LinkIcon, Sparkles, Zap, Activity,
    BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Trash2, Download
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, isFuture, startOfDay, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
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

interface RecentItem {
    id: string;
    name: string;
    type: 'file' | 'folder' | 'document' | 'note';
    updatedAt: string;
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
    const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
    const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [storageUsed, setStorageUsed] = useState(0);
    const [storageLimit, setStorageLimit] = useState(53687091200);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState<Date>(new Date());

    // Get greeting based on time of day
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return "Buenos días";
        if (hour >= 12 && hour < 20) return "Buenas tardes";
        return "Buenas noches";
    };

    // Auto-sync every 30 seconds
    useEffect(() => {
        if (!user) return;

        const syncInterval = setInterval(() => {
            fetchData(true); // Silent sync
        }, 30000); // 30 seconds

        return () => clearInterval(syncInterval);
    }, [user]);

    const fetchData = async (silent = false) => {
        if (!user) return;
        if (!silent) setLoading(true);
        
        try {
            const [eventsRes, usageRes, filesRes, docsRes, notesRes, activitiesRes] = await Promise.all([
                axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                    params: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
                    withCredentials: true
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true }).catch(() => ({ data: { used: 0, limit: 53687091200 } })),
                axios.get(API_ENDPOINTS.FILES.BASE, { 
                    params: { limit: 5, sort: 'updated' },
                    withCredentials: true 
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.DOCUMENTS.BASE, { 
                    params: { limit: 5 },
                    withCredentials: true 
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.NOTES.BASE, { 
                    params: { limit: 5 },
                    withCredentials: true 
                }).catch(() => ({ data: [] })),
                axios.get(API_ENDPOINTS.ACTIVITY.BASE, {
                    params: { limit: 10 },
                    withCredentials: true
                }).catch(() => ({ data: [] })),
            ]);

            // Get upcoming events (next 7 days)
            const now = startOfDay(new Date());
            const nextWeek = new Date(now);
            nextWeek.setDate(nextWeek.getDate() + 7);
            
            const upcoming = eventsRes.data
                .filter((e: CalendarEvent) => {
                    const eventDate = startOfDay(new Date(e.startDate));
                    return eventDate >= now && eventDate <= nextWeek;
                })
                .sort((a: CalendarEvent, b: CalendarEvent) => 
                    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                )
                .slice(0, 5);

            setUpcomingEvents(upcoming);

            // Combine recent items
            const recent: RecentItem[] = [
                ...filesRes.data.slice(0, 3).map((f: any) => ({
                    id: f.id,
                    name: f.originalName,
                    type: 'file' as const,
                    updatedAt: f.createdAt,
                })),
                ...docsRes.data.slice(0, 2).map((d: any) => ({
                    id: d.id,
                    name: d.title,
                    type: 'document' as const,
                    updatedAt: d.updatedAt,
                })),
                ...notesRes.data.slice(0, 2).map((n: any) => ({
                    id: n.id,
                    name: n.title || 'Sin título',
                    type: 'note' as const,
                    updatedAt: n.updatedAt,
                })),
            ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

            setRecentItems(recent);
            setActivities(activitiesRes.data || []);
            setStorageUsed(Number(usageRes.data.used || 0));
            setStorageLimit(Number(usageRes.data.limit || 53687091200));
            setLastSync(new Date());
        } catch (err) {
            console.error("Failed to fetch home data:", err);
        } finally {
            if (!silent) setLoading(false);
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
        
        if (isToday(eventDate)) return "Hoy";
        if (isTomorrow(eventDate)) return "Mañana";
        const daysDiff = differenceInDays(eventDate, today);
        if (daysDiff <= 7) {
            return format(eventDate, "EEEE d 'de' MMMM", { locale: es });
        }
        return format(eventDate, "d 'de' MMMM", { locale: es });
    };

    if (loading) {
        return (
            <div className="space-y-8">
                <div className="h-8 bg-muted/40 rounded-xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 bg-muted/40 rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header with Sync Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground tracking-tightest">
                        <span className="inline-block">{getGreeting()},</span>{" "}
                        <span className="inline-block">{user?.displayName || user?.username || "Usuario"}</span>
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm font-medium flex items-center gap-2">
                        <Activity className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">Sincronizado {format(lastSync, "HH:mm", { locale: es })}</span>
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fetchData()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary/20 transition-colors"
                >
                    <Zap className="w-4 h-4" />
                    Sincronizar
                </motion.button>
            </div>

            {/* Enhanced Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Storage */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-background to-muted/20 border border-border/60 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                                <HardDrive className="w-7 h-7 text-primary-foreground" />
                            </div>
                            <Link href="/dashboard/files" className="text-primary hover:text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                        <h3 className="text-3xl font-extrabold text-foreground mb-1">
                            {formatBytes(storageUsed)}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            de {formatBytes(storageLimit)} usado
                        </p>
                        <div className="w-full h-2.5 bg-muted/50 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${storagePercent}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={cn(
                                    "h-full rounded-full shadow-sm",
                                    isCritical ? "bg-gradient-to-r from-red-500 to-red-600" : 
                                    isWarning ? "bg-gradient-to-r from-amber-500 to-amber-600" : 
                                    "bg-gradient-to-r from-primary to-primary/80"
                                )}
                            />
                        </div>
                        <p className="text-xs font-bold text-muted-foreground mt-2">
                            {Math.round(storagePercent)}% utilizado
                        </p>
                    </div>
                </motion.div>

                {/* Upcoming Events */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-background to-purple-500/5 border border-purple-500/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                                <Calendar className="w-7 h-7 text-white" />
                            </div>
                            <Link href="/dashboard/calendar" className="text-purple-500 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                        <h3 className="text-3xl font-extrabold text-foreground mb-1">
                            {upcomingEvents.length}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Eventos próximos
                        </p>
                        {upcomingEvents.length > 0 && (
                            <div className="mt-3 flex items-center gap-1 text-xs font-bold text-purple-500">
                                <ArrowUpRight className="w-3 h-3" />
                                Próximo: {getEventDateLabel(upcomingEvents[0].startDate)}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Recent Documents */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-br from-background to-blue-500/5 border border-blue-500/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <FileText className="w-7 h-7 text-white" />
                            </div>
                            <Link href="/dashboard/documents" className="text-blue-500 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                        <h3 className="text-3xl font-extrabold text-foreground mb-1">
                            {recentItems.filter(i => i.type === 'document').length}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Documentos recientes
                        </p>
                    </div>
                </motion.div>

                {/* Notes */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-br from-background to-yellow-500/5 border border-yellow-500/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                                <StickyNote className="w-7 h-7 text-white" />
                            </div>
                            <Link href="/dashboard/notes" className="text-yellow-500 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                        <h3 className="text-3xl font-extrabold text-foreground mb-1">
                            {recentItems.filter(i => i.type === 'note').length}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Notas activas
                        </p>
                    </div>
                </motion.div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Events - Enhanced */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-gradient-to-br from-background to-muted/10 border border-border/60 rounded-2xl p-6 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <Calendar className="w-4 h-4 text-purple-500" />
                            </div>
                            Próximos Eventos
                        </h2>
                        <Link href="/dashboard/calendar" className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 group">
                            Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                    {upcomingEvents.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                                <Calendar className="w-8 h-8 opacity-20" />
                            </div>
                            <p className="text-sm font-medium mb-2">No hay eventos próximos</p>
                            <Link href="/dashboard/calendar">
                                <button className="mt-4 text-xs font-bold text-primary hover:text-primary/80 px-4 py-2 bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors">
                                    Crear evento
                                </button>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {upcomingEvents.map((event, index) => (
                                <motion.div
                                    key={event.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                    className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all border border-transparent hover:border-border/40 group cursor-pointer"
                                >
                                    <div className={cn(
                                        "w-3 h-full rounded-full shrink-0 mt-1 shadow-sm",
                                        event.color === 'primary' ? 'bg-gradient-to-b from-primary to-primary/80' :
                                        event.color === 'blue' ? 'bg-gradient-to-b from-blue-500 to-blue-600' :
                                        event.color === 'green' ? 'bg-gradient-to-b from-emerald-500 to-emerald-600' :
                                        event.color === 'yellow' ? 'bg-gradient-to-b from-amber-500 to-amber-600' :
                                        event.color === 'red' ? 'bg-gradient-to-b from-rose-500 to-rose-600' :
                                        'bg-gradient-to-b from-purple-500 to-purple-600'
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                            {event.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-xs text-muted-foreground">
                                                {getEventDateLabel(event.startDate)}
                                            </p>
                                            {isToday(startOfDay(new Date(event.startDate))) && (
                                                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                                                    Hoy
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Activity Feed - Nextcloud-like */}
                {activities.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-gradient-to-br from-background to-green-500/5 border border-green-500/20 rounded-2xl p-6 shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center">
                                    <Activity className="w-4 h-4 text-green-500" />
                                </div>
                                Actividad Reciente
                            </h2>
                        </div>
                        <div className="space-y-2">
                            {activities.slice(0, 5).map((activity: any, index: number) => (
                                <motion.div
                                    key={activity.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 + index * 0.05 }}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        {activity.type.includes('upload') && <File className="w-4 h-4 text-primary" />}
                                        {activity.type.includes('delete') && <Trash2 className="w-4 h-4 text-red-500" />}
                                        {activity.type.includes('create') && <Plus className="w-4 h-4 text-green-500" />}
                                        {activity.type.includes('download') && <Download className="w-4 h-4 text-blue-500" />}
                                        {!activity.type.includes('upload') && !activity.type.includes('delete') && !activity.type.includes('create') && !activity.type.includes('download') && <Activity className="w-4 h-4 text-muted-foreground" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {activity.action}
                                        </p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(activity.createdAt), "d 'de' MMM, HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Recent Items - Enhanced */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-gradient-to-br from-background to-muted/10 border border-border/60 rounded-2xl p-6 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-primary" />
                            </div>
                            Recientes
                        </h2>
                        <Link href="/dashboard" className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 group">
                            Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                    {recentItems.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                                <File className="w-8 h-8 opacity-20" />
                            </div>
                            <p className="text-sm font-medium">No hay elementos recientes</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentItems.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.6 + index * 0.1 }}
                                >
                                    <Link
                                        href={
                                            item.type === 'file' ? `/dashboard?preview=${item.id}` :
                                            item.type === 'document' ? `/dashboard/documents/${item.id}` :
                                            item.type === 'note' ? `/dashboard/notes` :
                                            `/dashboard`
                                        }
                                        className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all border border-transparent hover:border-border/40 group"
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                            item.type === 'file' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' :
                                            item.type === 'document' ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white' :
                                            item.type === 'note' ? 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white' :
                                            'bg-muted text-muted-foreground'
                                        )}>
                                            {item.type === 'file' ? <File className="w-5 h-5" /> :
                                             item.type === 'document' ? <FileText className="w-5 h-5" /> :
                                             item.type === 'note' ? <StickyNote className="w-5 h-5" /> :
                                             <Folder className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                {item.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(item.updatedAt), "d 'de' MMM, HH:mm", { locale: es })}
                                            </p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all opacity-0 group-hover:opacity-100 group-hover:translate-x-1" />
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Enhanced Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-gradient-to-br from-background to-muted/10 border border-border/60 rounded-2xl p-6 shadow-lg"
            >
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Acciones Rápidas</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Link href="/dashboard/files" className="flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all border border-primary/20 hover:border-primary/40 group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
                            <File className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-foreground">Subir Archivo</span>
                    </Link>
                    <Link href="/dashboard/documents" className="flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 hover:from-blue-500/20 hover:to-blue-500/10 transition-all border border-blue-500/20 hover:border-blue-500/40 group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-foreground">Nuevo Documento</span>
                    </Link>
                    <Link href="/dashboard/notes" className="flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 hover:from-yellow-500/20 hover:to-yellow-500/10 transition-all border border-yellow-500/20 hover:border-yellow-500/40 group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20 group-hover:scale-110 transition-transform">
                            <StickyNote className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-foreground">Nueva Nota</span>
                    </Link>
                    <Link href="/dashboard/calendar" className="flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 hover:from-purple-500/20 hover:to-purple-500/10 transition-all border border-purple-500/20 hover:border-purple-500/40 group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                            <Calendar className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-foreground">Nuevo Evento</span>
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
