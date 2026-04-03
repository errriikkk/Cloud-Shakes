"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, File, Folder, ChevronRight, Loader2, Link as LinkIcon, FileText, Image as ImageIcon, Video, Music, StickyNote, Calendar, Share2, Copy, Check, Command } from "lucide-react";
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

/* --- Helper to Highlight Text --- */
function HighlightedText({ text = "", highlight = "" }: { text?: string, highlight?: string }) {
    if (!highlight.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${highlight})`, "gi");
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, i) => 
                regex.test(part) ? <span key={i} className="text-primary font-black bg-primary/10 rounded px-0.5">{part}</span> : <span key={i}>{part}</span>
            )}
        </span>
    );
}

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
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const resultListRef = useRef<HTMLDivElement>(null);

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
            setTimeout(() => {
                inputRef.current?.focus();
                setIsFocused(true);
            }, 100);
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
                } catch (err) {
                    console.error("Search failed:", err);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults({ files: [], folders: [], notes: [], calendarEvents: [] });
                setSelectedIndex(0);
            }
        }, 250); // slight debounce speedup for raycast feel

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
            setSelectedIndex(prev => {
                const nextId = (prev + 1) % filteredResults.length;
                scrollIntoView(nextId);
                return nextId;
            });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => {
                const nextId = (prev - 1 + filteredResults.length) % filteredResults.length;
                scrollIntoView(nextId);
                return nextId;
            });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredResults[selectedIndex]) {
                handleSelect(filteredResults[selectedIndex]);
            }
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    const scrollIntoView = (index: number) => {
        if (!resultListRef.current) return;
        const list = resultListRef.current;
        const items = list.querySelectorAll('[data-search-item]');
        const target = items[index] as HTMLElement;
        if (target) {
            const listRect = list.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            if (targetRect.bottom > listRect.bottom) {
                list.scrollTop += (targetRect.bottom - listRect.bottom) + 12; // 12 padding offset
            } else if (targetRect.top < listRect.top) {
                list.scrollTop -= (listRect.top - targetRect.top) + 12;
            }
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
        const iconClass = "w-5 h-5";
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

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-background/50 backdrop-blur-md z-[100]"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: isMobile ? 1 : 0.98, y: isMobile ? 0 : -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: isMobile ? 1 : 0.98, y: isMobile ? 0 : -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className={cn(
                            "fixed z-[101] bg-sidebar/98 border border-border/50 shadow-2xl overflow-hidden flex flex-col",
                            isMobile 
                                ? "inset-0 rounded-none h-full" 
                                : "top-[10vh] left-1/2 -translate-x-1/2 w-full max-w-3xl rounded-3xl max-h-[80vh]"
                        )}
                    >
                        {/* Search Input Area */}
                        <div className={cn(
                            "flex items-center border-b border-border/30 gap-4 bg-background/30 transition-colors",
                            isMobile ? "px-5 py-4" : "px-6 py-5",
                            isFocused ? "bg-background/60 border-primary/20" : ""
                        )}>
                            <Search className={cn("w-6 h-6 shrink-0 transition-colors", isFocused ? "text-primary" : "text-muted-foreground/50")} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setSelectedIndex(0);
                                }}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                onKeyDown={handleKeyDown}
                                placeholder={t("search.placeholder")}
                                className="flex-1 bg-transparent border-none text-xl font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                            />
                            {loading && <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />}
                            {isMobile ? (
                                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors shrink-0 bg-muted/40">
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            ) : (
                                <div className="flex flex-col items-center justify-center bg-muted/50 border border-border/50 rounded-md px-2 py-1 shrink-0">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase leading-none">ESC</span>
                                </div>
                            )}
                        </div>

                        {/* Categories Tabs */}
                        <AnimatePresence>
                            {query.trim().length > 1 && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-b border-border/30 bg-muted/10 overflow-hidden shrink-0"
                                >
                                    <div className={cn("flex gap-2 overflow-x-auto no-scrollbar", isMobile ? "px-4 py-2" : "px-6 py-3")}>
                                        {categories.map((cat) => {
                                            const isActive = selectedCategory === cat.key || (!selectedCategory && cat.key === 'all');
                                            return (
                                                <button
                                                    key={cat.key}
                                                    onClick={() => {
                                                        setSelectedCategory(cat.key);
                                                        setSelectedIndex(0);
                                                    }}
                                                    className={cn(
                                                        "relative px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap overflow-hidden group",
                                                        isActive ? "text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50"
                                                    )}
                                                >
                                                    {isActive && (
                                                        <motion.div 
                                                            layoutId="categoryIndicator" 
                                                            className="absolute inset-0 bg-primary z-0" 
                                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                        />
                                                    )}
                                                    <span className="relative z-10">{cat.label} {cat.count > 0 && <span className="opacity-70 ml-1">({cat.count})</span>}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Results Body */}
                        <div 
                            ref={resultListRef}
                            className="flex-1 overflow-y-auto no-scrollbar relative p-2"
                        >
                            {query.trim().length <= 1 ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center opacity-60">
                                    <div className="relative">
                                        <Command className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
                                        <motion.div 
                                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 2 }}
                                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-primary/20 rounded-full blur-2xl -z-10"
                                        />
                                    </div>
                                    <h3 className="text-xl font-bold text-foreground mb-2">Search Everything</h3>
                                    <p className="text-sm text-muted-foreground max-w-sm">Files, folders, notes, calendar events, and team members. Start typing to begin.</p>
                                </div>
                            ) : loading && filteredResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                                    <Loader2 className="w-10 h-10 animate-spin text-primary/30 mx-auto mb-4" />
                                    <p className="text-sm font-medium text-muted-foreground">Searching backend...</p>
                                </div>
                            ) : filteredResults.length === 0 && !loading ? (
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-col items-center justify-center h-full min-h-[300px] text-center"
                                >
                                    <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-6 border border-border/40">
                                        <Search className="w-8 h-8 text-muted-foreground/30" />
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground">No results found</h3>
                                    <p className="text-sm text-muted-foreground">We couldn't find anything matching <span className="text-foreground font-semibold">"{query}"</span></p>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    initial={{ opacity: 0 }} 
                                    animate={{ opacity: 1 }} 
                                    transition={{ duration: 0.15 }}
                                    className="space-y-1 relative"
                                >
                                    {filteredResults.map((item, index) => {
                                        const isSelected = index === selectedIndex;
                                        return (
                                            <div
                                                key={`${item.type}-${item.id}`}
                                                data-search-item
                                                onClick={() => handleSelect(item)}
                                                onMouseMove={() => setSelectedIndex(index)}
                                                className={cn(
                                                    "relative flex items-center gap-4 rounded-2xl cursor-pointer p-3",
                                                    isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                                )}
                                            >
                                                {/* Animated Selection Background (Raycast style) */}
                                                {isSelected && (
                                                    <motion.div
                                                        layoutId="searchResultHighlight"
                                                        className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-2xl z-0"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                                    />
                                                )}

                                                <div className="relative z-10 flex items-center justify-center shrink-0 w-12 h-12 rounded-xl bg-background border border-border/20 shadow-sm overflow-hidden">
                                                    {item.type === 'file' && item.mimeType?.startsWith('image/') ? (
                                                        <img src={`${API}/api/files/${item.id}/preview`} alt="" className="w-full h-full object-cover" />
                                                    ) : item.type === 'file' && item.mimeType?.startsWith('video/') ? (
                                                        <div className="relative w-full h-full bg-black flex items-center justify-center">
                                                            <Video className="w-5 h-5 text-white/50" />
                                                        </div>
                                                    ) : (
                                                        getFileIcon(item)
                                                    )}
                                                </div>

                                                <div className="relative z-10 flex-1 min-w-0">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold text-base truncate">
                                                            <HighlightedText text={item.originalName || item.name || item.title} highlight={query} />
                                                        </span>
                                                        <span className="shrink-0 text-[10px] items-center px-1.5 py-0.5 rounded bg-muted/50 border border-border/40 font-bold text-muted-foreground uppercase tracking-widest">
                                                            {getTypeLabel(item.type)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center text-sm mt-0.5 opacity-70">
                                                        {item.type === 'calendar' && item.startDate && (
                                                            <div className="flex items-center">
                                                                <Calendar className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                                                <span className="truncate">{new Date(item.startDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                            </div>
                                                        )}
                                                        {item.type !== 'calendar' && (
                                                            <div className="flex items-center truncate">
                                                                <span className="font-semibold">My Cloud</span>
                                                                {(item.folder?.name || item.parent?.name) && (
                                                                    <>
                                                                        <ChevronRight className="w-3.5 h-3.5 mx-1" />
                                                                        <span>{item.folder?.name || item.parent?.name}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right Side Icons & Actions */}
                                                <div className="relative z-10 flex items-center gap-3 shrink-0">
                                                    {item.owner && (
                                                        <ActivityAvatar user={item.owner} resourceId={item.id} resourceType={item.type} />
                                                    )}

                                                    {(item.type === 'file') && (
                                                        <button
                                                            onClick={(e) => handleShare(e, item)}
                                                            className={cn(
                                                                "p-2 rounded-xl transition-all",
                                                                copiedId === item.id ? "bg-green-500/10 text-green-500" : isSelected ? "bg-background shadow text-foreground" : "hover:bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                        </button>
                                                    )}

                                                    {!isMobile && (
                                                        <div className={cn(
                                                            "flex items-center gap-1.5 transition-all text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-widest",
                                                            isSelected ? "opacity-100 bg-primary text-primary-foreground shadow-sm" : "opacity-0 text-muted-foreground bg-muted border border-border"
                                                        )}>
                                                            ↵
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </div>

                        {/* Footer Hints */}
                        {!isMobile && (
                            <div className="px-6 py-4 border-t border-border/30 bg-muted/10 flex items-center justify-between text-xs font-bold text-muted-foreground/60 uppercase tracking-widest shrink-0">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <kbd className="bg-background px-2 py-1 rounded shadow-sm border border-border/40 font-sans">↑</kbd>
                                        <kbd className="bg-background px-2 py-1 rounded shadow-sm border border-border/40 font-sans">↓</kbd>
                                        <span>Navigate</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <kbd className="bg-background px-3 py-1 rounded shadow-sm border border-border/40 font-sans">Enter</kbd>
                                        <span>Select</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>Shakes Search Engine</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
