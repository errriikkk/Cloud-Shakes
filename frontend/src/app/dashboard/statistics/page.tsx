"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { 
    HardDrive, FileText, StickyNote, Calendar, Link as LinkIcon,
    TrendingUp, File, Folder, Database, BarChart3, PieChart,
    Eye, CheckCircle2, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function StatisticsPage() {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        storage: { used: 0, limit: 53687091200 },
        files: { total: 0, byType: {} as Record<string, number> },
        folders: 0,
        documents: 0,
        notes: 0,
        calendarEvents: 0,
        links: 0,
    });
    const [linkStats, setLinkStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!user) return;
            try {
                const [usageRes, filesRes, foldersRes, docsRes, notesRes, eventsRes, linksRes, linksStatsRes] = await Promise.all([
                    axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true }).catch(() => ({ data: { used: 0, limit: 53687091200 } })),
                    axios.get(API_ENDPOINTS.FILES.BASE, { withCredentials: true }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.FOLDERS.BASE, { withCredentials: true }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.DOCUMENTS.BASE, { withCredentials: true }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.NOTES.BASE, { withCredentials: true }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.CALENDAR.BASE, { 
                        params: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
                        withCredentials: true 
                    }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.LINKS.BASE, { withCredentials: true }).catch(() => ({ data: [] })),
                    axios.get(API_ENDPOINTS.LINKS.STATS, { withCredentials: true }).catch(() => ({ data: null })),
                ]);

                // Calculate file types
                const byType: Record<string, number> = {};
                filesRes.data.forEach((f: any) => {
                    const type = f.mimeType?.split('/')[0] || 'other';
                    byType[type] = (byType[type] || 0) + 1;
                });

                setStats({
                    storage: {
                        used: Number(usageRes.data.used || 0),
                        limit: Number(usageRes.data.limit || 53687091200),
                    },
                    files: {
                        total: filesRes.data.length,
                        byType,
                    },
                    folders: foldersRes.data.length,
                    documents: docsRes.data.length,
                    notes: notesRes.data.length,
                    calendarEvents: eventsRes.data.length,
                    links: linksRes.data.length,
                });
                
                if (linksStatsRes.data) {
                    setLinkStats(linksStatsRes.data);
                }
            } catch (err) {
                console.error("Failed to fetch stats:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    const storagePercent = stats.storage.limit > 0 
        ? Math.min((stats.storage.used / stats.storage.limit) * 100, 100) 
        : 0;

    if (loading) {
        return (
            <div className="space-y-8">
                <div className="h-8 bg-muted/40 rounded-xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 bg-muted/40 rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                    Estadísticas
                </h1>
                <p className="text-muted-foreground mt-2 text-sm font-medium">
                    Análisis y métricas de tu espacio de trabajo
                </p>
            </div>

            {/* Storage Overview */}
            <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <HardDrive className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Almacenamiento</h2>
                        <p className="text-xs text-muted-foreground">Uso total del espacio</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Espacio usado</span>
                        <span className="text-sm font-bold text-foreground">
                            {formatBytes(stats.storage.used)} / {formatBytes(stats.storage.limit)}
                        </span>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${storagePercent}%` }}
                            transition={{ duration: 1 }}
                            className={cn(
                                "h-full rounded-full",
                                storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-primary"
                            )}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {Math.round(storagePercent)}% del espacio total utilizado
                    </p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <File className="w-6 h-6 text-blue-500" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground mb-1">
                        {stats.files.total}
                    </h3>
                    <p className="text-xs text-muted-foreground">Archivos totales</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Folder className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground mb-1">
                        {stats.folders}
                    </h3>
                    <p className="text-xs text-muted-foreground">Carpetas</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-purple-500" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground mb-1">
                        {stats.documents}
                    </h3>
                    <p className="text-xs text-muted-foreground">Documentos</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                            <StickyNote className="w-6 h-6 text-yellow-500" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-foreground mb-1">
                        {stats.notes}
                    </h3>
                    <p className="text-xs text-muted-foreground">Notas</p>
                </motion.div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <Calendar className="w-5 h-5 text-purple-500" />
                        <h3 className="text-sm font-bold text-foreground">Eventos</h3>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.calendarEvents}</p>
                </div>

                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <LinkIcon className="w-5 h-5 text-blue-500" />
                        <h3 className="text-sm font-bold text-foreground">Enlaces compartidos</h3>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.links}</p>
                </div>

                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <PieChart className="w-5 h-5 text-primary" />
                        <h3 className="text-sm font-bold text-foreground">Tipos de archivo</h3>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                        {Object.keys(stats.files.byType).length}
                    </p>
                </div>
            </div>

            {/* File Types Breakdown */}
            {Object.keys(stats.files.byType).length > 0 && (
                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Distribución por tipo de archivo
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(stats.files.byType)
                            .sort(([, a], [, b]) => b - a)
                            .map(([type, count]) => {
                                const percent = (count / stats.files.total) * 100;
                                return (
                                    <div key={type} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-foreground capitalize">
                                                {type === 'other' ? 'Otros' : type}
                                            </span>
                                            <span className="text-sm font-bold text-muted-foreground">
                                                {count} ({Math.round(percent)}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percent}%` }}
                                                transition={{ duration: 1, delay: 0.5 }}
                                                className="h-full bg-primary rounded-full"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Link Statistics */}
            {linkStats && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <LinkIcon className="w-6 h-6 text-primary" />
                        Estadísticas de Enlaces Compartidos
                    </h2>

                    {/* Link Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <LinkIcon className="w-5 h-5 text-primary" />
                                <h3 className="text-sm font-bold text-foreground">Total Enlaces</h3>
                            </div>
                            <p className="text-3xl font-bold text-foreground">{linkStats.totalLinks}</p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <Eye className="w-5 h-5 text-blue-500" />
                                <h3 className="text-sm font-bold text-foreground">Total Visualizaciones</h3>
                            </div>
                            <p className="text-3xl font-bold text-foreground">{linkStats.totalViews}</p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                <h3 className="text-sm font-bold text-foreground">Enlaces Activos</h3>
                            </div>
                            <p className="text-3xl font-bold text-foreground">{linkStats.activeLinks}</p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                                <h3 className="text-sm font-bold text-foreground">Enlaces Expirados</h3>
                            </div>
                            <p className="text-3xl font-bold text-foreground">{linkStats.expiredLinks}</p>
                        </motion.div>
                    </div>

                    {/* Links by Type */}
                    {Object.keys(linkStats.linksByType).length > 0 && (
                        <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                <PieChart className="w-5 h-5 text-primary" />
                                Enlaces por Tipo
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {Object.entries(linkStats.linksByType).map(([type, count]: [string, any]) => (
                                    <div key={type} className="p-4 bg-muted/30 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-foreground capitalize">
                                                {type === 'file' ? 'Archivos' : type === 'document' ? 'Documentos' : 'Carpetas'}
                                            </span>
                                            <span className="text-lg font-bold text-primary">{count}</span>
                                        </div>
                                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(count / linkStats.totalLinks) * 100}%` }}
                                                transition={{ duration: 1, delay: 0.5 }}
                                                className="h-full bg-primary rounded-full"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Most Viewed Links */}
                    {linkStats.mostViewed && linkStats.mostViewed.length > 0 && (
                        <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-primary" />
                                Enlaces Más Vistos
                            </h3>
                            <div className="space-y-2">
                                {linkStats.mostViewed.slice(0, 5).map((link: any, index: number) => (
                                    <div key={link.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                                {index + 1}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-foreground capitalize">
                                                    {link.type === 'file' ? 'Archivo' : link.type === 'document' ? 'Documento' : 'Carpeta'}
                                                </p>
                                                <p className="text-xs text-muted-foreground font-mono">{link.id}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Eye className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-bold text-foreground">{link.views}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

