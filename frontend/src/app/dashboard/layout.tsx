"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    Loader2, LogOut, HardDrive, Link as LinkIcon,
    Menu, X, Cloud, Database, Folder, ChevronDown, ChevronRight,
    FileText, StickyNote, Calendar, MoreHorizontal, Search, Home, BarChart3, Settings, Image as ImageIcon, Video, MessageSquare, Activity
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
import { useTranslation } from "@/lib/i18n";
import { usePermission } from "@/hooks/usePermission";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, logout } = useAuth();
    const pathname = usePathname();
    const { t } = useTranslation();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [storageUsed, setStorageUsed] = useState<number>(0);
    const [storageLimit, setStorageLimit] = useState<number>(53687091200);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [filesFolders, setFilesFolders] = useState<any[]>([]);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        "/dashboard": true
    });

    useEffect(() => {
        const fetchUsage = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.FILES.USAGE, { withCredentials: true });
                setStorageUsed(Number(res.data.used));
                setStorageLimit(Number(res.data.limit));
            } catch (err) {
                // silently fail
            }
        };
        if (user) fetchUsage();
    }, [user, pathname]);

    const fetchFolders = useCallback(async () => {
        if (!user) return;
        try {
            const filesRes = await axios.get(`${API_ENDPOINTS.FOLDERS.BASE}`, {
                params: { parentId: null },
                withCredentials: true
            });
            // Handle both old array and new {data, pagination} format
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
    }, []);

    if (loading) {
        return (
            <div className="h-screen-dvh flex items-center justify-center bg-background">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
                </motion.div>
            </div>
        );
    }

    if (!user) return null;

    // Sidebar navigation items
    const sidebarItems = [
        { href: "/dashboard/home", icon: Home, label: t("nav.home") },
        { href: "/dashboard/files", icon: HardDrive, label: t("nav.files") },
        { href: "/dashboard/documents", icon: FileText, label: t("nav.documents") },
        { href: "/dashboard/notes", icon: StickyNote, label: t("nav.notes") },
        { href: "/dashboard/calendar", icon: Calendar, label: t("nav.calendar") },
        { href: "/dashboard/chat", icon: MessageSquare, label: t("nav.chat") },
        { href: "/dashboard/links", icon: LinkIcon, label: t("nav.shared") },
        { href: "/dashboard/statistics", icon: BarChart3, label: t("nav.statistics") },
        { href: "/dashboard/activity", icon: Activity, label: t("nav.activity") || "Activity Log", permission: 'view_activity' },
    ];

    // Bottom nav items (mobile) — max 5 for clean UX
    const bottomNavItems = [
        { href: "/dashboard/home", icon: Home, label: t("nav.home") },
        { href: "/dashboard/files", icon: HardDrive, label: t("nav.files") },
        { href: "/dashboard/documents", icon: FileText, label: t("nav.documents") },
        { href: "/dashboard/notes", icon: StickyNote, label: t("nav.notes") },
                { href: "/dashboard/calendar", icon: Calendar, label: t("nav.calendar") },
    ];

    const storagePercent = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
    const isCritical = storagePercent > 90;
    const isWarning = storagePercent > 70;

    const NavItem = ({ href, icon: Icon, label, folders }: { href: string; icon: any; label: string, folders?: any[] }) => {
        const isActive = pathname === href || (pathname.startsWith(href + "/") && href !== "/dashboard/home" && href !== "/dashboard/files") || (href === "/dashboard/home" && pathname === "/dashboard/home") || (href === "/dashboard/files" && (pathname === "/dashboard" || pathname === "/dashboard/files"));
        const isExpanded = expandedSections[href];

        const toggleExpand = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setExpandedSections(prev => ({ ...prev, [href]: !prev[href] }));
        };

        return (
            <div className="mb-0.5">
                <Link href={href} onClick={() => setMobileSidebarOpen(false)}>
                    <div
                        className={cn(
                            "flex items-center px-3 py-2 rounded-xl transition-all duration-200 group text-sm font-medium",
                            isActive && !folders?.some(f => pathname.includes(f.id))
                                ? "bg-accent text-primary shadow-sm"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                    >
                        <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center mr-3 transition-colors",
                            isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-background"
                        )}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <span className="flex-1">{label}</span>
                        {folders && folders.length > 0 && (
                            <button
                                onClick={toggleExpand}
                                className="p-1 hover:bg-black/5 rounded-md transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                                )}
                            </button>
                        )}
                    </div>
                </Link>

                {/* Sub-items (folders) */}
                <AnimatePresence>
                    {isExpanded && folders && folders.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden ml-9 space-y-0.5 mt-0.5"
                        >
                            {folders.map(folder => (
                                <Suspense key={folder.id} fallback={<div className="h-7 animate-pulse bg-muted/20 rounded-lg ml-3 mr-3" />}>
                                    <SubItem
                                        folder={folder}
                                        href={href}
                                        pathname={pathname}
                                        onSelect={() => setMobileSidebarOpen(false)}
                                    />
                                </Suspense>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="p-5 flex items-center justify-between">
                <Link href="/dashboard/home" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-105 overflow-hidden">
                        <img src="/logo-512.png" alt="Cloud Shakes" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-tight">Cloud Shakes</span>
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
                <NavItem href="/dashboard/home" icon={Home} label={t("nav.home")} />

                <div className="h-px bg-border/40 my-2 mx-2" />

                {(user.isAdmin || user.permissions?.includes('view_files')) && (
                    <NavItem href="/dashboard/files" icon={HardDrive} label={t("nav.files")} folders={filesFolders} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_documents')) && (
                    <NavItem href="/dashboard/documents" icon={FileText} label={t("nav.documents")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_notes')) && (
                    <NavItem href="/dashboard/notes" icon={StickyNote} label={t("nav.notes")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_calendar')) && (
                    <NavItem href="/dashboard/calendar" icon={Calendar} label={t("nav.calendar")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_chat')) && (
                    <NavItem href="/dashboard/chat" icon={MessageSquare} label={t("nav.chat")} />
                )}

                <div className="h-px bg-border/40 my-2 mx-2" />

                {(user.isAdmin || user.permissions?.includes('view_links')) && (
                    <NavItem href="/dashboard/links" icon={LinkIcon} label={t("nav.shared")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_gallery')) && (
                    <NavItem href="/dashboard/gallery" icon={ImageIcon} label={t("nav.gallery")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_statistics')) && (
                    <NavItem href="/dashboard/statistics" icon={BarChart3} label={t("nav.statistics")} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_activity')) && (
                    <NavItem href="/dashboard/activity" icon={Activity} label={t("nav.activity") || "Activity Log"} />
                )}
                {(user.isAdmin || user.permissions?.includes('view_settings')) && (
                    <NavItem href="/dashboard/settings" icon={Settings} label={t("nav.settings")} />
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
                                {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
                            </p>
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
                                    <p className="text-[10px] text-muted-foreground font-medium truncate">{t("common.loading")}</p>
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

    return (
        <div className="h-full bg-background text-foreground flex flex-col md:flex-row font-sans overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {mobileSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMobileSidebarOpen(false)}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-40 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Mobile Sidebar (slide over) */}
            <AnimatePresence>
                {mobileSidebarOpen && (
                    <motion.aside
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ ease: "circOut", duration: 0.2 }}
                        className="fixed inset-y-0 left-0 w-72 bg-sidebar border-r border-border z-50 md:hidden flex flex-col"
                        data-marquee-ignore="true"
                    >
                        <SidebarContent />
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 bg-sidebar border-r border-border flex-col shrink-0 h-full" data-marquee-ignore="true">
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <header className="h-12 border-b border-border flex items-center px-4 md:hidden bg-background shrink-0" data-marquee-ignore="true">
                    <button
                        onClick={() => setMobileSidebarOpen(true)}
                        className="text-muted-foreground hover:text-foreground p-1 -ml-1"
                        data-marquee-ignore="true"
                    >
                        <Menu className="w-5 h-5" data-marquee-ignore="true" />
                    </button>
                    <span className="ml-3 font-semibold text-sm text-foreground flex-1">Cloud Shakes</span>
                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className="text-muted-foreground hover:text-foreground p-1"
                    >
                        <Search className="w-5 h-5" />
                    </button>
                </header>

                {/* Content — scrollable */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 content-with-nav">
                    <div className="max-w-5xl mx-auto">
                        <Suspense fallback={<div className="py-20 text-center text-muted-foreground text-sm font-medium">{t("common.loadingContent")}</div>}>
                            <DashboardContent>
                                {children}
                            </DashboardContent>
                        </Suspense>
                    </div>
                </div>
            </main>

            {/* Bottom Navigation Bar — Mobile Only */}
            <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-background/95 backdrop-blur-xl border-t border-border z-30" data-marquee-ignore="true"
                style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
                    marginBottom: 'env(safe-area-inset-bottom, 0px)'
                }}
            >
                <div className="flex items-center justify-around h-16 px-2 pb-safe">
                    {bottomNavItems.map(({ href, icon: Icon, label }) => {
                        const isActive = pathname === href || (pathname.startsWith(href + "/") && href !== "/dashboard") || (href === "/dashboard" && pathname === "/dashboard");
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-all min-w-[3.5rem]",
                                    isActive
                                        ? "text-primary"
                                        : "text-muted-foreground/60 active:text-foreground"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                                    isActive ? "bg-accent" : ""
                                )}>
                                    <Icon className={cn("w-5 h-5 transition-all", isActive ? "scale-105" : "")} />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-semibold transition-all",
                                    isActive ? "text-primary" : ""
                                )}>
                                    {label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Search Modal */}
            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

            {/* PWA Install Prompt */}
            <PwaInstallPrompt />
        </div>
    );
}

function SubItem({ folder, href, pathname, onSelect }: { folder: any; href: string; pathname: string; onSelect: () => void }) {
    const searchParams = useSearchParams();
    const currentFolderParam = searchParams.get("folder");

    return (
        <Link
            href={`${href}?folder=${folder.id}`}
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                currentFolderParam === folder.id
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            onClick={onSelect}
        >
            <Folder className={cn("w-3.5 h-3.5", pathname.includes(folder.id) ? "fill-current/10" : "opacity-40")} />
            <span className="truncate">{folder.name}</span>
        </Link>
    );
}

function ContentWrapper({ children, pathname }: { children: React.ReactNode; pathname: string }) {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);

    // Include search params in the key to handle query parameter changes
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
            <motion.div
                key={contentKey}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: isLoading ? 0.5 : 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{
                    duration: 0.25,
                    ease: [0.4, 0, 0.2, 1],
                }}
                style={{ willChange: 'transform, opacity' }}
                className="min-h-full"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {children}
            <NotificationPanel />
        </div>
    );
}
