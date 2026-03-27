"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, File, Folder, ChevronRight, Loader2, Link as LinkIcon, FileText, Image as ImageIcon, Video, Music, StickyNote, Calendar, Share2, Copy, Check } from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { API_ENDPOINTS } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { ActivityAvatar } from "@/components/ActivityAvatar";

interface SearchResult {
    id: string;
    originalName?: string;
    name?: string;
    title?: string;
    type: 'file' | 'folder' | 'note' | 'calendar';
    mimeType?: string;
    folder?: { id: string, name: string };
    parent?: { id: string, name: string };
    description?: string;
    startDate?: string;
    owner?: { id: string; username: string; displayName: string; avatarUrl?: string | null };
}

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<{ 
        files: SearchResult[], 
        folders: SearchResult[],
        notes: SearchResult[],
        calendarEvents: SearchResult[]
    }>({ files: [], folders: [], notes: [], calendarEvents: [] });
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setResults({ files: [], folders: [], notes: [], calendarEvents: [] });
            setSelectedIndex(0);
            setSelectedCategory(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim().length > 1) {
                setLoading(true);
                try {
                    const res = await axios.get(`${API}/api/search`, {
                        params: { q: query },
                        withCredentials: true
                    });
                    setResults(res.data);
                    setSelectedIndex(0);
                    setSelectedCategory(null);
                } catch (err) {
                    console.error("Search failed:", err);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults({ files: [], folders: [], notes: [], calendarEvents: [] });
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const allResults: SearchResult[] = [
        ...results.folders,
        ...results.files,
        ...results.notes,
        ...results.calendarEvents,
    ];

    const categories = [
        { key: 'all', label: t("search.all"), count: allResults.length },
        { key: 'files', label: t("nav.files"), count: results.files.length },
        { key: 'folders', label: t("search.folders"), count: results.folders.length },
        { key: 'notes', label: t("nav.notes"), count: results.notes.length },
        { key: 'calendar', label: t("nav.calendar"), count: results.calendarEvents.length },
    ];

    const filteredResults = selectedCategory && selectedCategory !== 'all'
        ? allResults.filter(r => {
            if (selectedCategory === 'files') return r.type === 'file';
            if (selectedCategory === 'folders') return r.type === 'folder';
            if (selectedCategory === 'notes') return r.type === 'note';
            if (selectedCategory === 'calendar') return r.type === 'calendar';
            return true;
        })
        : allResults;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredResults.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredResults[selectedIndex]) {
                handleSelect(filteredResults[selectedIndex]);
            }
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    const handleSelect = (item: SearchResult) => {
        onClose();
        if (item.type === 'folder') {
            router.push(`/dashboard/files?folder=${item.id}`);
        } else if (item.type === 'file') {
            const folderId = item.folder?.id || item.parent?.id || '';
            const path = folderId ? `/dashboard/files?folder=${folderId}&preview=${item.id}` : `/dashboard/files?preview=${item.id}`;
            router.push(path);
        } else if (item.type === 'note') {
            router.push(`/dashboard/notes`);
        } else if (item.type === 'calendar') {
            router.push(`/dashboard/calendar`);
        }
    };

    const handleShare = async (e: React.MouseEvent, item: SearchResult) => {
        e.stopPropagation();
        try {
            if (item.type === 'file') {
                const res = await axios.post(API_ENDPOINTS.LINKS.BASE, {
                    fileId: item.id,
                    type: 'file',
                }, { withCredentials: true });
                const shareUrl = `${window.location.origin}/s/${res.data.id}`;
                await navigator.clipboard.writeText(shareUrl);
                setCopiedId(item.id);
                setTimeout(() => setCopiedId(null), 2000);
            }
        } catch (err) {
            console.error("Share failed:", err);
        }
    };

    const getFileIcon = (item: SearchResult) => {
        const iconClass = "w-4 h-4";
        if (item.type === 'folder') return <Folder className={iconClass} />;
        if (item.type === 'note') return <StickyNote className={cn(iconClass, "text-yellow-500")} />;
        if (item.type === 'calendar') return <Calendar className={cn(iconClass, "text-purple-500")} />;
        if (!item.mimeType) return <File className={iconClass} />;
        if (item.mimeType.startsWith('image/')) return <ImageIcon className={cn(iconClass, "text-blue-500")} />;
        if (item.mimeType.startsWith('video/')) return <Video className={cn(iconClass, "text-purple-500")} />;
        if (item.mimeType.startsWith('audio/')) return <Music className={cn(iconClass, "text-pink-500")} />;
        if (item.mimeType.includes('pdf')) return <FileText className={cn(iconClass, "text-red-500")} />;
        return <File className={cn(iconClass, "text-gray-400")} />;
    };

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            'file': t("common.itemType.file"),
            'folder': t("common.itemType.folder"),
            'note': t("common.itemType.note"),
            'calendar': t("common.itemType.calendar"),
        };
        return labels[type] || 'Item';
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            'file': 'bg-muted/60 text-muted-foreground',
            'folder': 'bg-primary/5 text-primary',
            'note': 'bg-yellow-500/10 text-yellow-500',
            'calendar': 'bg-purple-500/10 text-purple-500',
        };
        return colors[type] || 'bg-muted/60 text-muted-foreground';
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[100]"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: isMobile ? 1 : 0.95, y: isMobile ? 0 : -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: isMobile ? 1 : 0.95, y: isMobile ? 0 : -20 }}
                        className={cn(
                            "fixed z-[101] bg-sidebar border border-border/60 shadow-2xl overflow-hidden",
                            isMobile 
                                ? "inset-0 rounded-none" 
                                : "top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-2xl rounded-3xl"
                        )}
                    >
                        {/* Search Input */}
                        <div className={cn(
                            "flex items-center border-b border-border/40 gap-4 bg-background/50",
                            isMobile ? "px-4 py-4" : "px-6 py-5"
                        )}>
                            <Search className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t("search.placeholder")}
                                className="flex-1 bg-transparent border-none text-base md:text-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                            />
                            {loading && <Loader2 className="w-5 h-5 animate-spin text-primary/40 shrink-0" />}
                            {isMobile ? (
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                                >
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            ) : (
                                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-widest border border-border/40">
                                    ESC
                                </div>
                            )}
                        </div>

                        {/* Categories (Mobile: horizontal scroll, Desktop: tabs) */}
                        {query.trim().length > 1 && (
                            <div className={cn(
                                "border-b border-border/40 bg-muted/20",
                                isMobile ? "overflow-x-auto no-scrollbar px-4 py-2" : "px-6 py-3"
                            )}>
                                <div className={cn(
                                    "flex gap-2",
                                    isMobile ? "flex-nowrap" : "flex-wrap"
                                )}>
                                    {categories.map((cat) => (
                                        <button
                                            key={cat.key}
                                            onClick={() => {
                                                setSelectedCategory(cat.key);
                                                setSelectedIndex(0);
                                            }}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                                                selectedCategory === cat.key || (!selectedCategory && cat.key === 'all')
                                                    ? "bg-primary text-primary-foreground shadow-sm"
                                                    : "bg-background/50 text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            {cat.label} {cat.count > 0 && `(${cat.count})`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Results */}
                        <div className={cn(
                            "overflow-y-auto no-scrollbar",
                            isMobile ? "h-[calc(100vh-140px)]" : "max-h-[60vh]"
                        )}>
                            {query.trim().length <= 1 ? (
                                <div className={cn("text-center", isMobile ? "p-8" : "p-12")}>
                                    <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4 border border-border/40">
                                        <Search className="w-8 h-8 text-muted-foreground/20" />
                                    </div>
                                    <h3 className="text-sm font-bold text-foreground mb-1">{t("search.quickSearch")}</h3>
                                    <p className="text-xs text-muted-foreground">{t("search.description")}</p>
                                </div>
                            ) : filteredResults.length === 0 && !loading ? (
                                <div className={cn("text-center text-muted-foreground", isMobile ? "p-8" : "p-12")}>
                                    {t("search.noResults")} "{query}"
                                </div>
                            ) : (
                                <div className={cn("space-y-1", isMobile ? "p-2" : "p-2")}>
                                    {filteredResults.map((item, index) => (
                                        <div
                                            key={`${item.type}-${item.id}`}
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            className={cn(
                                                "flex items-center gap-3 md:gap-4 rounded-2xl cursor-pointer transition-all border border-transparent",
                                                isMobile ? "px-3 py-2.5" : "px-4 py-3",
                                                index === selectedIndex && "bg-primary/10 border-primary/20 shadow-sm"
                                            )}
                                        >
                                            <div className={cn(
                                                "rounded-xl flex items-center justify-center shrink-0 border border-border/20 overflow-hidden bg-muted/20",
                                                isMobile ? "w-9 h-9" : "w-10 h-10",
                                                getTypeColor(item.type)
                                            )}>
                                                {item.type === 'file' && item.mimeType?.startsWith('image/') ? (
                                                    <img 
                                                        src={`${API}/api/files/${item.id}/preview`} 
                                                        alt="" 
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : item.type === 'file' && item.mimeType?.startsWith('video/') ? (
                                                    <video 
                                                        src={`${API}/api/files/${item.id}/preview`} 
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        playsInline
                                                    />
                                                ) : (
                                                    getFileIcon(item)
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={cn(
                                                        "font-bold text-foreground truncate",
                                                        isMobile ? "text-sm" : "text-sm"
                                                    )}>
                                                        {item.originalName || item.name || item.title}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                                                        {getTypeLabel(item.type)}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "flex items-center text-muted-foreground/60 font-medium",
                                                    isMobile ? "text-[10px]" : "text-[11px]"
                                                )}>
                                                    {item.type === 'calendar' && item.startDate && (
                                                        <>
                                                            <Calendar className="w-3 h-3 mr-1" />
                                                            <span>{new Date(item.startDate).toLocaleDateString(undefined)}</span>
                                                        </>
                                                    )}
                                                    {item.type !== 'calendar' && (
                                                        <>
                                                            <span>{t("files.myUnit")}</span>
                                                            {(item.folder?.name || item.parent?.name) && (
                                                                <>
                                                                    <ChevronRight className="w-3 h-3 mx-1" />
                                                                    <span className="truncate">{item.folder?.name || item.parent?.name}</span>
                                                                </>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <ActivityAvatar
                                                user={item.owner}
                                                resourceId={item.id}
                                                resourceType={item.type}
                                            />

                                            {(item.type === 'file') && (
                                                <button
                                                    onClick={(e) => handleShare(e, item)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all shrink-0",
                                                        isMobile ? "p-1.5" : "p-2",
                                                        "hover:bg-muted text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    {copiedId === item.id ? (
                                                        <Check className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                        <Share2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}

                                            {!isMobile && index === selectedIndex && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border shadow-sm text-[10px] font-bold text-foreground uppercase tracking-widest">
                                                    Enter
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {!isMobile && (
                            <div className="px-6 py-3 border-t border-border/40 bg-muted/20 flex items-center justify-between text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <span className="bg-muted px-1.5 py-0.5 rounded border border-border/60">↑↓</span>
                                        <span>{t("search.navigate")}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="bg-muted px-1.5 py-0.5 rounded border border-border/60">Enter</span>
                                        <span>{t("search.select")}</span>
                                    </div>
                                </div>
                                <span>{t("search.quickSearch")}</span>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
