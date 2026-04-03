"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    Loader2, LogOut, HardDrive, Link as LinkIcon,
    Menu, X, Cloud, Database, Folder, ChevronDown, ChevronRight,
    StickyNote, Calendar, MoreHorizontal, Search, Home, BarChart3, Settings, Image as ImageIcon, Video, MessageSquare, Activity, Zap
} from "lucide-react";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { SearchModal } from "@/components/SearchModal";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { NotificationPanel } from "@/components/NotificationPanel";
import { UploadProgress } from "@/components/UploadProgress";
import { useTranslation } from "@/lib/i18n";
import { usePermission } from "@/hooks/usePermission";
import { useBranding } from "@/lib/branding";

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) return "∞";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface NavItemProps {
    href: string;
    icon: any;
    label: string;
    folders?: any[];
    onSelect: () => void;
}

function NavItem({ href, icon: Icon, label, folders, onSelect }: NavItemProps) {
    const pathname = usePathname();
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        "/dashboard": true
    });

    const isActive = pathname === href || (pathname.startsWith(href + "/") && href !== "/dashboard/home" && href !== "/dashboard/files") || (href === "/dashboard/home" && pathname === "/dashboard/home") || (href === "/dashboard/files" && (pathname === "/dashboard" || pathname === "/dashboard/files"));

    return (
        <div className="relative">
            <Link
                href={href}
                onClick={onSelect}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    folders && folders.length > 0 && "justify-between"
                )}
            >
                <div className="flex items-center gap-3 flex-1">
                    <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
                    <span>{label}</span>
                </div>
                {folders && folders.length > 0 && (
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expandedSections[href] && "rotate-180")} />
                )}
            </Link>
            {folders && folders.length > 0 && expandedSections[href] && (
                <div className="ml-4 mt-1 space-y-0.5">
                    {folders.slice(0, 5).map((folder: any) => (
                        <Link
                            key={folder.id}
                            href={`/dashboard/files?folder=${folder.id}`}
                            onClick={onSelect}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                            <Folder className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[120px]">{folder.name}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SidebarContentProps {
    logoUrl: string | null;
    cloudName: string;
    t: any;
    setIsSearchOpen: (val: boolean) => void;
    setMobileSidebarOpen: (val: boolean) => void;
    user: any;
    filesFolders: any[];
    loading: boolean;
    storagePercent: number;
    isCritical: boolean;
    isWarning: boolean;
    storageUsed: number;
    storageLimit: number | null;
    logout: () => void;
    networkSpeed: { download: number; upload: number; timestamp: number } | null;
    onRunSpeedTest: () => void;
}

function SidebarContent({
    logoUrl,
    cloudName,
    t,
    setIsSearchOpen,
    setMobileSidebarOpen,
    user,
    filesFolders,
    loading,
    storagePercent,
    isCritical,
    isWarning,
    storageUsed,
    storageLimit,
    logout,
    networkSpeed,
    onRunSpeedTest,
}: SidebarContentProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="p-5 flex items-center justify-between">
                <Link href="/dashboard/home" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-105 overflow-hidden">
                        <img src={logoUrl || "/logo-512.png"} alt={cloudName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-tight">{cloudName}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest -mt-0.5">{t("nav.workspace")}</span>
                    </div>
                </Link>
                <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Search button */}
            <div className="px-4 mb-3">
                <button
                    onClick={() => { setIsSearchOpen(true); setMobileSidebarOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground/60 bg-muted/40 border border-border/40 hover:bg-muted hover:text-muted-foreground transition-all"
                >
                    <Search className="w-4 h-4" />
                    <span className="flex-1 text-left">{t("common.search")}</span>
                    <kbd className="hidden md:inline-flex text-[10px] font-bold bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-muted-foreground/50">⌘⇧P</kbd>
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
                <NavItem href="/dashboard/home" icon={Home} label={t("nav.home")} onSelect={() => setMobileSidebarOpen(false)} />

                <div className="h-px bg-border/40 my-2 mx-2" />

                {(user.isAdmin || user.permissions?.includes('view_files')) && (
                    <NavItem href="/dashboard/files" icon={HardDrive} label={t("nav.files")} folders={filesFolders} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                
                {(user.isAdmin || user.permissions?.includes('view_notes')) && (
                    <NavItem href="/dashboard/notes" icon={StickyNote} label={t("nav.notes")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_calendar')) && (
                    <NavItem href="/dashboard/calendar" icon={Calendar} label={t("nav.calendar")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_chat')) && (
                    <NavItem href="/dashboard/chat" icon={MessageSquare} label={t("nav.chat")} onSelect={() => setMobileSidebarOpen(false)} />
                )}

                <div className="h-px bg-border/40 my-2 mx-2" />

                {(user.isAdmin || user.permissions?.includes('view_links')) && (
                    <NavItem href="/dashboard/links" icon={LinkIcon} label={t("nav.shared")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_gallery')) && (
                    <NavItem href="/dashboard/gallery" icon={ImageIcon} label={t("nav.gallery")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_statistics')) && (
                    <NavItem href="/dashboard/statistics" icon={BarChart3} label={t("nav.statistics")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_activity')) && (
                    <NavItem href="/dashboard/activity" icon={Activity} label={t("nav.activity") || "Activity Log"} onSelect={() => setMobileSidebarOpen(false)} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_plugins')) && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/40 cursor-not-allowed select-none">
                        <Zap className="w-5 h-5" />
                        <span>Plugins</span>
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary/60 px-1.5 py-0.5 rounded-full">Soon</span>
                    </div>
                )}
                {(user.isAdmin || user.permissions?.includes('view_settings')) && (
                    <NavItem href="/dashboard/settings" icon={Settings} label={t("nav.settings")} onSelect={() => setMobileSidebarOpen(false)} />
                )}
            </nav>

            {/* Storage Usage + User Info */}
            <div className="p-4 border-t border-border mt-auto space-y-4">
                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-2 w-full rounded-full" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                ) : (
                    <>
                        {/* Storage Bar */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-1.5">
                                    <Database className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("nav.storage")}</span>
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground">{Math.round(storagePercent)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${storagePercent}%` }}
                                    transition={{ duration: 1, ease: "circOut" }}
                                    className={cn(
                                        "h-full rounded-full transition-colors duration-500",
                                        isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-primary"
                                    )}
                                />
                            </div>
                            <p className="px-1 text-[10px] text-muted-foreground font-medium">
                                {formatBytes(storageUsed)} / {storageLimit === null ? "—" : formatBytes(storageLimit)}
                            </p>
                        </div>

                        {/* Network Speed */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nube Speed</span>
                                </div>
                                <button 
                                    onClick={onRunSpeedTest}
                                    className="text-[10px] text-primary hover:text-primary/80 font-medium"
                                    title="Test again"
                                >
                                    ↻
                                </button>
                            </div>
                            {networkSpeed ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-muted/40 rounded-lg p-2 text-center">
                                        <p className="text-[8px] text-muted-foreground uppercase">Download</p>
                                        <p className="text-xs font-bold text-foreground">{networkSpeed.download} MB/s</p>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-2 text-center">
                                        <p className="text-[8px] text-muted-foreground uppercase">Upload</p>
                                        <p className="text-xs font-bold text-foreground">{networkSpeed.upload} MB/s</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-[10px] text-muted-foreground px-1">Testing...</div>
                            )}
                        </div>

                        {/* User info */}
                        <div className="space-y-1.5">
                            <Link href="/dashboard/settings" className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                                {user.avatarUrl ? (
                                    <img
                                        src={user.avatarUrl}
                                        alt="Avatar"
                                        className="w-8 h-8 rounded-xl object-cover border border-border/50 shrink-0"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center font-bold text-xs text-foreground shrink-0 border border-border/50">
                                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground font-semibold truncate leading-none mb-0.5">{user.displayName || user.username}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium truncate">
                                        {user.isAdmin ? "Admin" : (user.roles?.[0] || "")}
                                    </p>
                                </div>
                            </Link>
                            <button
                                className="w-full flex items-center px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-xl transition-all"
                                onClick={logout}
                            >
                                <LogOut className="w-3.5 h-3.5 mr-2.5" />
                                {t("auth.logout")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, logout } = useAuth();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { cloudName, logoUrl } = useBranding();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [storageUsed, setStorageUsed] = useState<number>(0);
    const [storageLimit, setStorageLimit] = useState<number | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [filesFolders, setFilesFolders] = useState<any[]>([]);
    const [networkSpeed, setNetworkSpeed] = useState<{ download: number; upload: number; timestamp: number } | null>(null);

    // Network speed test - use existing endpoints
    const runSpeedTest = useCallback(async () => {
        try {
            const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
            
            // Test download speed - fetch a small file
            const startDownload = performance.now();
            await axios.get(`${API}/api/files`, { 
                withCredentials: true,
                timeout: 10000 
            });
            const endDownload = performance.now();
            const downloadTime = (endDownload - startDownload) / 1000;
            // Estimate based on typical API response size (~50KB)
            const estimatedDownloadSpeed = downloadTime > 0 ? (50 / downloadTime) : 0;

            // Test upload speed - send a small payload to a simple endpoint
            const uploadData = new Array(50 * 1024).fill('x').join(''); // 50KB
            const startUpload = performance.now();
            await axios.post(`${API}/api/activity`, 
                { type: 'speed_test', data: uploadData },
                { withCredentials: true, timeout: 10000 }
            ).catch(() => {
                // Ignore errors for upload test
            });
            const endUpload = performance.now();
            const uploadTime = (endUpload - startUpload) / 1000;
            const uploadSpeed = uploadTime > 0 ? (uploadData.length / uploadTime / 1024) : 0;

            setNetworkSpeed({
                download: Math.round(estimatedDownloadSpeed * 10) / 10,
                upload: Math.round(uploadSpeed * 10) / 10,
                timestamp: Date.now()
            });
        } catch (err) {
            console.error("Speed test failed:", err);
        }
    }, []);

    // Run speed test on mount and periodically
    useEffect(() => {
        runSpeedTest();
        const interval = setInterval(runSpeedTest, 60000); // Every minute
        return () => clearInterval(interval);
    }, [runSpeedTest]);

    useEffect(() => {
        const fetchUsage = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true });
                setStorageUsed(Number(res.data.used));
                setStorageLimit(res.data.limit === null ? Number.POSITIVE_INFINITY : Number(res.data.limit));
            } catch (err) {
                setStorageLimit(null);
            }
        };
        if (user) fetchUsage();

        // Listen for mobile menu trigger from chat
        const handleOpenMobileMenu = () => setMobileSidebarOpen(true);
        window.addEventListener('openMobileMenu', handleOpenMobileMenu);
        return () => window.removeEventListener('openMobileMenu', handleOpenMobileMenu);
    }, [user, pathname]);

    const fetchFolders = useCallback(async () => {
        if (!user) return;
        try {
            const filesRes = await axios.get(`${API_ENDPOINTS.FOLDERS.BASE}`, {
                params: { parentId: null },
                withCredentials: true
            });
            const files = filesRes.data.data || filesRes.data || [];
            setFilesFolders(files);
        } catch (err) {
            console.error("Sidebar fetch failed:", err);
        }
    }, [user]);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders, pathname]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                setIsSearchOpen(true);
            }
        };
        const handleFolderUpdate = () => {
            fetchFolders();
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('folderUpdate', handleFolderUpdate);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('folderUpdate', handleFolderUpdate);
        };
    }, [fetchFolders]);

    if (loading) {
        return (
            <div className="h-screen-dvh flex items-center justify-center bg-background">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
                </motion.div>
            </div>
        );
    }

    if (!user) return null;

    const isFullBleedRoute = /^\/dashboard\/(chat|plugins)(\/|$)/.test(pathname);

    const isOfficeEditor = false;

    const bottomNavItems = [
        { href: "/dashboard/home", icon: Home, label: t("nav.home") },
        { href: "/dashboard/files", icon: HardDrive, label: t("nav.files") },
        { href: "/dashboard/notes", icon: StickyNote, label: t("nav.notes") },
        { href: "/dashboard/calendar", icon: Calendar, label: t("nav.calendar") },
    ];

    const effectiveLimit = storageLimit ?? 0;
    const storagePercent = effectiveLimit > 0 ? Math.min((storageUsed / effectiveLimit) * 100, 100) : 0;
    const isCritical = storagePercent > 90;
    const isWarning = storagePercent > 70;

    return (
        <div className="h-full bg-background text-foreground flex flex-col md:flex-row font-sans overflow-hidden">
            <AnimatePresence>
                {mobileSidebarOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileSidebarOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-40 md:hidden" />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {mobileSidebarOpen && (
                    <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ ease: "circOut", duration: 0.2 }} className="fixed inset-y-0 left-0 w-72 bg-sidebar border-r border-border z-50 md:hidden flex flex-col" data-marquee-ignore="true">
                        <SidebarContent logoUrl={logoUrl} cloudName={cloudName} t={t} setIsSearchOpen={setIsSearchOpen} setMobileSidebarOpen={setMobileSidebarOpen} user={user} filesFolders={filesFolders} loading={loading} storagePercent={storagePercent} isCritical={isCritical} isWarning={isWarning} storageUsed={storageUsed} storageLimit={storageLimit} logout={logout} networkSpeed={networkSpeed} onRunSpeedTest={runSpeedTest} />
                    </motion.aside>
                )}
            </AnimatePresence>
            <aside className="hidden md:flex w-64 bg-sidebar border-r border-border flex-col shrink-0 h-full" data-marquee-ignore="true">
                <SidebarContent logoUrl={logoUrl} cloudName={cloudName} t={t} setIsSearchOpen={setIsSearchOpen} setMobileSidebarOpen={setMobileSidebarOpen} user={user} filesFolders={filesFolders} loading={loading} storagePercent={storagePercent} isCritical={isCritical} isWarning={isWarning} storageUsed={storageUsed} storageLimit={storageLimit} logout={logout} networkSpeed={networkSpeed} onRunSpeedTest={runSpeedTest} />
            </aside>
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className={cn("h-12 border-b border-border flex items-center px-4 md:hidden bg-background shrink-0", isFullBleedRoute && "hidden")} data-marquee-ignore="true">
                    {!isFullBleedRoute && (
                        <>
                            <button onClick={() => setMobileSidebarOpen(true)} className="text-muted-foreground hover:text-foreground p-1 -ml-1" data-marquee-ignore="true">
                                <Menu className="w-5 h-5" data-marquee-ignore="true" />
                            </button>
                            <span className="ml-3 font-semibold text-sm text-foreground flex-1">{cloudName}</span>
                            <button onClick={() => setIsSearchOpen(true)} className="text-muted-foreground hover:text-foreground p-1">
                                <Search className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </header>
                <div
                    className={cn(
                        "flex-1 overflow-y-auto",
                        isOfficeEditor || isFullBleedRoute ? "p-0 overflow-hidden" : "content-with-nav p-4 md:p-8"
                    )}
                >
                    <Suspense fallback={<div className="py-20 text-center text-muted-foreground text-sm font-medium">{t("common.loadingContent")}</div>}>
                        <div className={cn(!(isOfficeEditor || isFullBleedRoute) && "mx-auto w-full max-w-[1400px]")}>
                            <DashboardContent>{children}</DashboardContent>
                        </div>
                    </Suspense>
                </div>
            </main>
            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
            <PwaInstallPrompt />
        </div>
    );
}

function SubItem({ folder, href, pathname, onSelect }: { folder: any; href: string; pathname: string; onSelect: () => void }) {
    const searchParams = useSearchParams();
    const currentFolderParam = searchParams.get("folder");
    return (
        <Link href={`${href}?folder=${folder.id}`} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors", currentFolderParam === folder.id ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")} onClick={onSelect}>
            <Folder className={cn("w-3.5 h-3.5", pathname.includes(folder.id) ? "fill-current/10" : "opacity-40")} />
            <span className="truncate">{folder.name}</span>
        </Link>
    );
}

function ContentWrapper({ children, pathname }: { children: React.ReactNode; pathname: string }) {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const folderParam = searchParams.get('folder');
    const previewParam = searchParams.get('preview');
    const contentKey = `${pathname}?folder=${folderParam || ''}&preview=${previewParam || ''}`;
    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => setIsLoading(false), 100);
        return () => clearTimeout(timer);
    }, [contentKey]);
    return (
        <AnimatePresence mode="wait">
            <motion.div key={contentKey} initial={{ opacity: 0, x: 8 }} animate={{ opacity: isLoading ? 0.5 : 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} style={{ willChange: 'transform, opacity' }} className="min-h-full">{children}</motion.div>
        </AnimatePresence>
    );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {children}
            <NotificationPanel />
            <UploadProgress />
        </div>
    );
}
