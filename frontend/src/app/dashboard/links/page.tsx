"use client";

import { useState, useEffect, Suspense } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
    Link as LinkIcon, Trash2, Copy, Eye, Lock, Unlock,
    Clock, FileText, Image as ImageIcon, Video, Music,
    ExternalLink, Zap, AlertTriangle, Check, Code, Folder, ChevronRight, HardDrive, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useRouter, useSearchParams } from "next/navigation";
import { API_ENDPOINTS } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface FolderItem {
    id: string;
    name: string;
    parentId: string | null;
}

interface LinkItem {
    id: string;
    fileId: string | null;
    folderId: string | null;
    type: string;
    views: number;
    isExpired: boolean;
    isPasswordProtected: boolean;
    directDownload: boolean;
    isEmbed: boolean;
    expiresAt: string | null;
    createdAt: string;
    file: {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        folderId: string | null;
        folder?: FolderItem | null;
    } | null;
    folder?: FolderItem | null;
}

interface GroupedLinks {
    fileId: string;
    links: LinkItem[];
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function SharedLinksContent() {
    const { t } = useTranslation();
    const searchParams = useSearchParams();
    const folderParam = searchParams.get("folder");

    const [links, setLinks] = useState<LinkItem[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [trail, setTrail] = useState<{ id: string | null, name: string }[]>([]);
    const [view, setView] = useState<'grid' | 'list'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('sharedViewMode') as 'grid' | 'list') || 'grid';
        }
        return 'grid';
    });

    useEffect(() => {
        localStorage.setItem('sharedViewMode', view);
    }, [view]);

    const router = useRouter();



    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Modal states
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [linkToDelete, setLinkToDelete] = useState<string | null>(null);
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [linkToProtect, setLinkToProtect] = useState<LinkItem | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [expiryModalOpen, setExpiryModalOpen] = useState(false);
    const [linkToExpire, setLinkToExpire] = useState<LinkItem | null>(null);
    const [expiryMinutes, setExpiryMinutes] = useState("");
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const fetchLinks = async () => {
        try {
            setLoading(true);
            // Use the standard links endpoint
            const res = await axios.get(`${API}/api/links`, {
                withCredentials: true
            });
            
            // Filter links by folder if folderParam is provided
            const allLinks = res.data || [];
            const filteredLinks = folderParam 
                ? allLinks.filter((link: LinkItem) => link.file?.folderId === folderParam || link.folderId === folderParam)
                : allLinks.filter((link: LinkItem) => !link.file?.folderId && !link.folderId);
            
            // Group links by fileId
            const linksByFile = new Map<string, LinkItem[]>();
            const ungroupedLinks: LinkItem[] = [];
            
            filteredLinks.forEach((link: LinkItem) => {
                if (link.fileId) {
                    if (!linksByFile.has(link.fileId)) {
                        linksByFile.set(link.fileId, []);
                    }
                    linksByFile.get(link.fileId)!.push(link);
                } else {
                    ungroupedLinks.push(link);
                }
            });
            
            // Flatten grouped links (file with multiple links will show as one item with expandable list)
            const processedLinks: (LinkItem | GroupedLinks)[] = [];
            
            linksByFile.forEach((fileLinks, fileId) => {
                if (fileLinks.length > 1) {
                    // Multiple links for same file - group them
                    processedLinks.push({ fileId, links: fileLinks });
                } else {
                    // Single link - add directly
                    processedLinks.push(fileLinks[0]);
                }
            });
            
            processedLinks.push(...ungroupedLinks);
            
            setLinks(processedLinks as any);
            
            // Extract unique folders from links
            const folderMap = new Map<string, FolderItem>();
            allLinks.forEach((link: LinkItem) => {
                if (link.file?.folder) {
                    const folder = link.file.folder;
                    if (!folderMap.has(folder.id)) {
                        folderMap.set(folder.id, folder);
                    }
                }
            });
            setFolders(Array.from(folderMap.values()));
            
            // Build trail (simplified - you may want to enhance this)
            setTrail(folderParam ? [{ id: folderParam, name: folderMap.get(folderParam)?.name || t('files.title') }] : []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLinks(); }, [folderParam]);

    const copyToClipboard = async (text: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for non-secure contexts (HTTP)
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                } catch (err) {
                    console.error('Fallback: Oops, unable to copy', err);
                }
                document.body.removeChild(textArea);
            }
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const handleCopy = async (id: string) => {
        const url = `${window.location.origin}/s/${id}`;
        await copyToClipboard(url);
        setCopiedId(id);
        setCopiedUrl(url);
        setCopyModalOpen(true);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleCopyEmbed = async (id: string) => {
        const url = `${window.location.origin}/api/links/${id}/raw`;
        await copyToClipboard(url);
        setCopiedId(`embed-${id}`);
        setCopiedUrl(url);
        setCopyModalOpen(true);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const confirmDelete = (id: string) => {
        setLinkToDelete(id);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!linkToDelete) return;
        try {
            await axios.delete(`${API}/api/links/${linkToDelete}`, { withCredentials: true });
            setLinks(links.filter(l => l.id !== linkToDelete));
        } catch (err) {
            console.error(err);
        } finally {
            setDeleteModalOpen(false);
            setLinkToDelete(null);
        }
    };

    const openPasswordModal = (link: LinkItem) => {
        if (link.isPasswordProtected) {
            // Direct remove
            handleTogglePassword(link, true);
        } else {
            setLinkToProtect(link);
            setNewPassword("");
            setPasswordModalOpen(true);
        }
    };

    const handleTogglePassword = async (link: LinkItem, remove = false) => {
        try {
            if (remove) {
                await axios.put(`${API}/api/links/${link.id}`, { removePassword: true }, { withCredentials: true });
            } else {
                if (!newPassword) return;
                await axios.put(`${API}/api/links/${link.id}`, { password: newPassword }, { withCredentials: true });
            }
            fetchLinks();
        } catch (err) {
            console.error(err);
        } finally {
            setPasswordModalOpen(false);
            setLinkToProtect(null);
        }
    };

    const handleToggleDirectDownload = async (link: LinkItem) => {
        try {
            await axios.put(`${API}/api/links/${link.id}`, {
                directDownload: !link.directDownload,
                isEmbed: false // Mutually exclusive
            }, { withCredentials: true });
            fetchLinks();
        } catch (err) {
            console.error(err);
        }
    };

    const handleToggleEmbed = async (link: LinkItem) => {
        try {
            await axios.put(`${API}/api/links/${link.id}`, {
                isEmbed: !link.isEmbed,
                directDownload: false, // Mutually exclusive
                password: null, // Clear security as requested for embeds
                expiresInMinutes: null
            }, { withCredentials: true });
            fetchLinks();
        } catch (err) {
            console.error(err);
        }
    };

    const openExpiryModal = (link: LinkItem) => {
        setLinkToExpire(link);
        setExpiryMinutes("");
        setExpiryModalOpen(true);
    };

    const handleSetExpiry = async () => {
        if (!linkToExpire) return;
        const minutes = parseInt(expiryMinutes);
        if (isNaN(minutes) || minutes <= 0) return;
        try {
            await axios.put(`${API}/api/links/${linkToExpire.id}`, { expiresInMinutes: minutes }, { withCredentials: true });
            fetchLinks();
        } catch (err) {
            console.error(err);
        } finally {
            setExpiryModalOpen(false);
            setLinkToExpire(null);
        }
    };

    const handleRemoveExpiry = async (id: string) => {
        try {
            await axios.put(`${API}/api/links/${id}`, { expiresInMinutes: null }, { withCredentials: true });
            setLinks(prev => prev.map(l => l.id === id ? { ...l, expiresAt: null, isExpired: false } : l));
        } catch (err) {
            console.error(err);
        }
    };

    const getFileIcon = (mimeType?: string) => {
        const iconClass = "w-5 h-5";
        if (mimeType === 'folder') return <LinkIcon className={`${iconClass} text-primary`} />;
        if (!mimeType) return <FileText className={`${iconClass} text-[#d4d4d4]`} />;
        if (mimeType.startsWith("image/")) return <ImageIcon className={`${iconClass} text-[#d4d4d4]`} />;
        if (mimeType.startsWith("video/")) return <Video className={`${iconClass} text-[#d4d4d4]`} />;
        if (mimeType.startsWith("audio/")) return <Music className={`${iconClass} text-[#d4d4d4]`} />;
        return <FileText className={`${iconClass} text-[#d4d4d4]`} />;
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
    });

    const timeUntilExpiry = (expiresAt: string) => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return t('links.expires');
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}d`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    if (loading) {
        return (
            <div className="py-20 text-center text-[#9b9b9b] text-sm font-medium">{t('common.loading')}</div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        {trail.map((item, index) => (
                            <div key={item.id || 'root'} className="flex items-center gap-2">
                                {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
                                <button
                                    onClick={() => {
                                        if (item.id) router.push(`/dashboard/links?folder=${item.id}`);
                                        else router.push('/dashboard/links');
                                    }}
                                    className={cn(
                                        "text-sm font-bold transition-colors",
                                        index === trail.length - 1
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {item.name}
                                </button>
                            </div>
                        ))}
                    </div>
                    <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                        {trail[trail.length - 1]?.name || t('links.title')}
                    </h1>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-muted/50 border border-border/60 rounded-2xl p-1 shrink-0">
                        <div className="px-4 py-2 flex items-center gap-2 bg-background rounded-xl shadow-sm border border-border/40">
                            <Eye className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-bold text-foreground">
                                {links.reduce((sum, l) => sum + l.views, 0)} <span className="text-muted-foreground font-medium">{t('links.clicks')}</span>
                            </span>
                        </div>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center bg-muted/50 border border-border/60 rounded-2xl p-1">
                        <button
                            onClick={() => setView('grid')}
                            className={cn(
                                "px-3 py-1.5 rounded-xl transition-all",
                                view === 'grid' ? "bg-background shadow-sm border border-border/40 text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span className="text-[10px] font-bold uppercase tracking-wider">{t('files.viewGrid')}</span>
                        </button>
                        <button
                            onClick={() => setView('list')}
                            className={cn(
                                "px-3 py-1.5 rounded-xl transition-all",
                                view === 'list' ? "bg-background shadow-sm border border-border/40 text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span className="text-[10px] font-bold uppercase tracking-wider">{t('files.viewList')}</span>
                        </button>
                    </div>
                </div>
            </div>


            {/* Content Display */}
            <div className={cn(
                "gap-4",
                view === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "flex flex-col"
            )}>
                <AnimatePresence mode="popLayout">
                    {/* Folders (Mirrors) */}
                    {folders.map((folder, idx) => (
                        <motion.div
                            key={folder.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ delay: idx * 0.05 }}
                            onClick={() => router.push(`/dashboard/links?folder=${folder.id}`)}
                            className={cn(
                                "group bg-background border border-border/60 rounded-3xl p-4 transition-all hover:border-border hover:shadow-xl hover:shadow-black/[0.03] active:scale-[0.995] cursor-pointer flex items-center gap-4",
                                view === 'list' ? "flex-row" : "flex-col text-center"
                            )}
                        >
                            <div className={cn(
                                "rounded-2xl bg-muted/60 flex items-center justify-center shrink-0 border border-border/40",
                                view === 'list' ? "w-12 h-12" : "w-16 h-16"
                            )}>
                                <Folder className={cn(
                                    "text-primary",
                                    view === 'list' ? "w-6 h-6" : "w-8 h-8"
                                )} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-bold text-foreground truncate">{folder.name}</h3>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">{t('files.noFolders').replace('No hay ', '')}</p>
                            </div>
                        </motion.div>
                    ))}

                    {/* Links */}
                    {links.map((item, idx) => {
                        // Check if this is a grouped item
                        const isGrouped = 'fileId' in item && 'links' in item;
                        if (isGrouped) {
                            const group = item as GroupedLinks;
                            const firstLink = group.links[0];
                            const isExpanded = expandedGroups.has(group.fileId);
                            
                            return (
                                <motion.div
                                    key={`group-${group.fileId}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ delay: (folders.length + idx) * 0.05 }}
                                    className={cn(
                                        "group bg-background border border-border/60 rounded-3xl transition-all hover:border-border hover:shadow-xl hover:shadow-black/[0.03]",
                                        view === 'list' ? "p-5" : "p-4"
                                    )}
                                >
                                    {/* Group Header */}
                                    <div className={cn(
                                        "flex gap-6",
                                        view === 'list' ? "flex-col lg:flex-row lg:items-center" : "flex-col"
                                    )}>
                                        <div className={cn(
                                            "flex items-center gap-4 flex-1 min-w-0",
                                            view === 'grid' && "flex-col text-center"
                                        )}>
                                            <div className={cn(
                                                "rounded-2xl bg-muted/60 flex items-center justify-center shrink-0 border border-border/40",
                                                view === 'list' ? "w-12 h-12" : "w-20 h-20 mb-2"
                                            )}>
                                                {getFileIcon(firstLink.file?.mimeType)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-sm font-bold text-foreground truncate">
                                                        {firstLink.file?.originalName || t('documents.untitled')}
                                                    </h3>
                                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                        {group.links.length} {t('links.title')}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "flex flex-wrap items-center gap-x-4 gap-y-1",
                                                    view === 'grid' && "justify-center"
                                                )}>
                                                    {firstLink.file && (
                                                        <span className="text-[10px] text-muted-foreground font-medium">{formatSize(firstLink.file.size)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={() => {
                                                const newExpanded = new Set(expandedGroups);
                                                if (isExpanded) {
                                                    newExpanded.delete(group.fileId);
                                                } else {
                                                    newExpanded.add(group.fileId);
                                                }
                                                setExpandedGroups(newExpanded);
                                            }}
                                            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </button>
                                    </div>
                                    
                                    {/* Expanded Links List */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="mt-4 pt-4 border-t border-border/40 space-y-3 overflow-hidden"
                                            >
                                                {group.links.map((link, linkIdx) => (
                                                    <div
                                                        key={link.id}
                                                        className="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                                                    >
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">/{link.id}</span>
                                                            <div className="flex items-center gap-2">
                                                                {link.isPasswordProtected && (
                                                                    <Lock className="w-3 h-3 text-primary" />
                                                                )}
                                                                {link.isExpired && (
                                                                    <AlertTriangle className="w-3 h-3 text-red-500" />
                                                                )}
                                                                {link.expiresAt && !link.isExpired && (
                                                                    <Clock className="w-3 h-3 text-blue-500" />
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {link.views} {t('links.clicks')}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleCopy(link.id)}
                                                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                title={t('common.copy')}
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => window.open(`/s/${link.id}`, '_blank')}
                                                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                title={t('gallery.view')}
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => confirmDelete(link.id)}
                                                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-400"
                                                                title={t('common.delete')}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        }
                        
                        // Regular single link
                        const link = item as LinkItem;
                        return (
                        <motion.div
                            key={link.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ delay: (folders.length + idx) * 0.05 }}
                            className={cn(
                                "group bg-background border border-border/60 rounded-3xl transition-all hover:border-border hover:shadow-xl hover:shadow-black/[0.03] active:scale-[0.995]",
                                link.isExpired && "opacity-60 saturate-50",
                                view === 'list' ? "p-5" : "p-4"
                            )}
                        >
                            <div className={cn(
                                "flex gap-6",
                                view === 'list' ? "flex-col lg:flex-row lg:items-center" : "flex-col"
                            )}>
                                {/* File info */}
                                <div className={cn(
                                    "flex items-center gap-4 flex-1 min-w-0",
                                    view === 'grid' && "flex-col text-center"
                                )}>
                                    <div className={cn(
                                        "rounded-2xl bg-muted/60 flex items-center justify-center shrink-0 border border-border/40",
                                        view === 'list' ? "w-12 h-12" : "w-20 h-20 mb-2"
                                    )}>
                                        {getFileIcon(link.file?.mimeType)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-bold text-foreground truncate mb-1">
                                            {link.file?.originalName || t('documents.untitled')}
                                        </h3>
                                        <div className={cn(
                                            "flex flex-wrap items-center gap-x-4 gap-y-1",
                                            view === 'grid' && "justify-center"
                                        )}>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">/{link.id}</span>
                                            {link.file && (
                                                <span className="text-[10px] text-muted-foreground font-medium">{formatSize(link.file.size)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Status badges / Controls */}
                                <div className={cn(
                                    "flex items-center gap-2 flex-wrap",
                                    view === 'grid' && "justify-center"
                                )}>
                                    {/* Views */}
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-muted/60 text-muted-foreground border border-border/40">
                                        <Eye className="w-3 h-3" />
                                        <span className="text-[10px] font-bold leading-none">{link.views}</span>
                                    </div>

                                    {/* Password status */}
                                    <button
                                        onClick={() => openPasswordModal(link)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all font-bold text-[10px] leading-none",
                                            link.isPasswordProtected
                                                ? "bg-primary text-white border-primary shadow-sm"
                                                : "bg-transparent border-border/60 text-muted-foreground hover:bg-muted/60"
                                        )}
                                    >
                                        {link.isPasswordProtected ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                        {view === 'list' && (link.isPasswordProtected ? t('talk.password') : "Public")}
                                    </button>

                                    {/* Expiry */}
                                    {link.isExpired ? (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-red-50 border border-red-100 text-red-600 font-bold text-[10px] leading-none">
                                            <AlertTriangle className="w-3 h-3" />
                                            Exp.
                                        </div>
                                    ) : link.expiresAt ? (
                                        <button
                                            onClick={() => openExpiryModal(link)}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 font-bold text-[10px] leading-none hover:bg-blue-100 transition-colors"
                                        >
                                            <Clock className="w-3 h-3" />
                                            {timeUntilExpiry(link.expiresAt)}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => openExpiryModal(link)}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-border/60 text-muted-foreground font-bold text-[10px] leading-none hover:bg-muted/60 transition-colors"
                                        >
                                            <Clock className="w-3 h-3" />
                                            {view === 'list' && t('links.never')}
                                        </button>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className={cn(
                                    "flex items-center gap-1",
                                    view === 'grid' ? "justify-center border-t border-border/40 pt-3 mt-1" : "justify-end lg:ml-auto"
                                )}>
                                    <button
                                        onClick={() => handleCopy(link.id)}
                                        className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                        title={t('common.copy')}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => window.open(`/s/${link.id}`, '_blank')}
                                        className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                        title={t('gallery.view')}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => confirmDelete(link.id)}
                                        className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 transition-all"
                                        title={t('common.delete')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Pagination/Scroll spacing */}
            <div className="h-20" />

            {/* Modals */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title={t('links.delete')}
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t('links.confirmDelete')}
                    </p>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            {t('common.delete')}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            <Modal
                isOpen={passwordModalOpen}
                onClose={() => setPasswordModalOpen(false)}
                title={t('talk.password')}
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('talk.password')}</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('talk.passwordPlaceholder')}
                            autoFocus
                        />
                    </div>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setPasswordModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={() => linkToProtect && handleTogglePassword(linkToProtect)}>
                            {t('common.save')}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            <Modal
                isOpen={copyModalOpen}
                onClose={() => setCopyModalOpen(false)}
                title={t('common.copied')}
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <input
                            readOnly
                            value={copiedUrl}
                            className="flex-1 bg-muted/60 border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground font-mono select-all focus:outline-none focus:border-primary/40 focus:bg-background transition-all"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                            onClick={() => copyToClipboard(copiedUrl)}
                            className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all shrink-0 shadow-sm shadow-primary/5"
                            title={t('common.copy')}
                        >
                            <Copy className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                            <Check className="w-6 h-6" />
                        </div>
                    </div>
                    <ModalFooter>
                        <Button className="rounded-xl w-full h-11 font-bold" onClick={() => setCopyModalOpen(false)}>{t('common.close')}</Button>
                    </ModalFooter>
                </div>
            </Modal>
        </div>
    );
}

export default function SharedLinksPage() {
    const { t } = useTranslation();
    return (
        <Suspense fallback={<div className="py-20 text-center text-muted-foreground text-sm font-medium">{t('common.loading')}</div>}>
            <SharedLinksContent />
        </Suspense>
    );
}
