"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
    Link as LinkIcon, Trash2, Copy, Eye, Lock, Unlock,
    Clock, FileText, Image as ImageIcon, Video, Music,
    ExternalLink, Zap, AlertTriangle, Check, Code, Folder,
    ChevronRight, ChevronDown, ChevronUp, Shield, Globe
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useRouter, useSearchParams } from "next/navigation";
import { API_ENDPOINTS } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePermission } from "@/hooks/usePermission";
import { showPermissionDenied } from "@/lib/permissionFeedback";

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

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatusBadge({
    icon: Icon,
    label,
    variant = "default",
}: {
    icon: React.ElementType;
    label: string;
    variant?: "default" | "active" | "warning" | "danger" | "info" | "embed";
}) {
    const variants = {
        default: "bg-muted/60 text-muted-foreground border-border/40",
        active: "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20",
        warning: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400",
        danger: "bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400",
        info: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400",
        embed: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
    };

    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold leading-none tracking-wide",
            variants[variant]
        )}>
            <Icon className="w-3 h-3" />
            {label}
        </span>
    );
}

function ActionButton({
    icon: Icon,
    label,
    onClick,
    variant = "ghost",
    disabled,
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: "ghost" | "danger";
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={cn(
                "group/btn relative p-2 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
                variant === "ghost" && "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
                variant === "danger" && "bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20"
            )}
        >
            <Icon className="w-4 h-4" />
            {/* Tooltip */}
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg bg-foreground text-background text-[10px] font-bold whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-10">
                {label}
            </span>
        </button>
    );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function SharedLinksContent() {
    const { t, locale } = useTranslation();
    const { canDeleteLinks } = usePermission();
    const searchParams = useSearchParams();
    const folderParam = searchParams.get("folder");

    const linksTitle = useMemo(() => {
        const lang = locale === "es" ? "es" : "en";
        return lang === "es" ? "Enlaces" : "Links";
    }, [locale]);

    useDocumentTitle(linksTitle);

    const [links, setLinks] = useState<LinkItem[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

    const router = useRouter();

    // ── Data fetching ──────────────────────────────────────────────────────────

    const fetchLinks = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API}/api/links`, { withCredentials: true });
            const allLinks: LinkItem[] = res.data || [];

            const filteredLinks = folderParam
                ? allLinks.filter(
                    (l) => l.file?.folderId === folderParam || l.folderId === folderParam
                )
                : allLinks.filter((l) => !l.file?.folderId && !l.folderId);

            const linksByFile = new Map<string, LinkItem[]>();
            const ungroupedLinks: LinkItem[] = [];

            filteredLinks.forEach((link) => {
                if (link.fileId) {
                    if (!linksByFile.has(link.fileId)) linksByFile.set(link.fileId, []);
                    linksByFile.get(link.fileId)!.push(link);
                } else {
                    ungroupedLinks.push(link);
                }
            });

            const processedLinks: (LinkItem | GroupedLinks)[] = [];
            linksByFile.forEach((fileLinks, fileId) => {
                if (fileLinks.length > 1) {
                    processedLinks.push({ fileId, links: fileLinks });
                } else {
                    processedLinks.push(fileLinks[0]);
                }
            });
            processedLinks.push(...ungroupedLinks);
            setLinks(processedLinks as any);

            const folderMap = new Map<string, FolderItem>();
            allLinks.forEach((link) => {
                if (link.file?.folder) {
                    const folder = link.file.folder;
                    if (!folderMap.has(folder.id)) folderMap.set(folder.id, folder);
                }
            });
            setFolders(Array.from(folderMap.values()));
            setTrail(
                folderParam
                    ? [{ id: folderParam, name: folderMap.get(folderParam)?.name || t("files.title") }]
                    : []
            );
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLinks(); }, [folderParam]);

    // ── Clipboard ──────────────────────────────────────────────────────────────

    const copyToClipboard = async (text: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.cssText = "position:fixed;left:-9999px;top:0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
        } catch (err) {
            console.error("Copy failed", err);
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
        const url = `${window.location.origin}/s/${id}/raw`;
        await copyToClipboard(url);
        setCopiedId(`embed-${id}`);
        setCopiedUrl(url);
        setCopyModalOpen(true);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // ── Actions ────────────────────────────────────────────────────────────────

    const confirmDelete = (id: string) => {
        setLinkToDelete(id);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!canDeleteLinks()) {
            showPermissionDenied("No tienes permiso para eliminar enlaces.", "delete_links");
            return;
        }
        if (!linkToDelete) return;
        try {
            await axios.delete(`${API}/api/links/${linkToDelete}`, { withCredentials: true });
            setLinks((prev) => prev.filter((l: any) => l.id !== linkToDelete));
        } catch (err) {
            console.error(err);
        } finally {
            setDeleteModalOpen(false);
            setLinkToDelete(null);
        }
    };

    const openPasswordModal = (link: LinkItem) => {
        if (!canDeleteLinks()) {
            showPermissionDenied("No tienes permiso para gestionar seguridad de enlaces.", "delete_links");
            return;
        }
        if (link.isPasswordProtected) {
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

    const openExpiryModal = (link: LinkItem) => {
        if (!canDeleteLinks()) {
            showPermissionDenied("No tienes permiso para gestionar expiracion de enlaces.", "delete_links");
            return;
        }
        setLinkToExpire(link);
        setExpiryMinutes("");
        setExpiryModalOpen(true);
    };

    const handleSetExpiry = async () => {
        if (!canDeleteLinks()) {
            showPermissionDenied("No tienes permiso para gestionar expiracion de enlaces.", "delete_links");
            return;
        }
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

    // ── Helpers ────────────────────────────────────────────────────────────────

    const getFileIcon = (mimeType?: string) => {
        const cls = "w-5 h-5";
        if (mimeType === "folder") return <LinkIcon className={`${cls} text-primary`} />;
        if (!mimeType) return <FileText className={`${cls} text-muted-foreground`} />;
        if (mimeType.startsWith("image/")) return <ImageIcon className={`${cls} text-muted-foreground`} />;
        if (mimeType.startsWith("video/")) return <Video className={`${cls} text-muted-foreground`} />;
        if (mimeType.startsWith("audio/")) return <Music className={`${cls} text-muted-foreground`} />;
        return <FileText className={`${cls} text-muted-foreground`} />;
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const timeUntilExpiry = (expiresAt: string) => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return t("links.expires");
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}d`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const totalViews = links.reduce((sum, l: any) => {
        if ("links" in l) return sum + l.links.reduce((s: number, lk: LinkItem) => s + lk.views, 0);
        return sum + (l.views || 0);
    }, 0);

    // ── Loading state ──────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground font-medium">{t("common.loading")}</p>
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8 max-w-4xl">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    {/* Breadcrumb */}
                    {trail.length > 0 && (
                        <nav className="flex items-center gap-1.5">
                            <button
                                onClick={() => router.push("/dashboard/links")}
                                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {t("links.title")}
                            </button>
                            {trail.map((item) => (
                                <span key={item.id} className="flex items-center gap-1.5">
                                    <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                                    <span className="text-xs font-semibold text-foreground">{item.name}</span>
                                </span>
                            ))}
                        </nav>
                    )}

                    <h1 className="text-4xl font-extrabold text-foreground tracking-tight">
                        {trail[trail.length - 1]?.name || t("links.title")}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {links.length} {links.length === 1 ? "enlace" : "enlaces"} · {totalViews} vistas en total
                    </p>
                </div>

                {/* Stats pill */}
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border border-border/60 rounded-2xl shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Eye className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium leading-none mb-0.5">{t("links.clicks")}</p>
                        <p className="text-sm font-extrabold text-foreground leading-none">{totalViews}</p>
                    </div>
                </div>
            </div>

            {/* ── Empty state ── */}
            {links.length === 0 && folders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center gap-4 border border-dashed border-border/60 rounded-3xl">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                        <LinkIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-foreground">No hay enlaces aún</p>
                        <p className="text-xs text-muted-foreground mt-1">Comparte un archivo para generar tu primer enlace</p>
                    </div>
                </div>
            )}

            {/* ── List ── */}
            <div className="flex flex-col gap-3">
                <AnimatePresence mode="popLayout">

                    {/* Folders */}
                    {folders.map((folder, idx) => (
                        <motion.div
                            key={folder.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ delay: idx * 0.04, duration: 0.2 }}
                            onClick={() => router.push(`/dashboard/links?folder=${folder.id}`)}
                            className="group flex items-center gap-4 bg-background border border-border/60 rounded-2xl p-4 cursor-pointer hover:border-border hover:shadow-lg hover:shadow-black/[0.04] active:scale-[0.998] transition-all duration-150"
                        >
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Folder className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{folder.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">Carpeta</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                        </motion.div>
                    ))}

                    {/* Links */}
                    {links.map((item: any, idx) => {
                        const isGrouped = "fileId" in item && "links" in item;

                        // ── Grouped links ──
                        if (isGrouped) {
                            const group = item as GroupedLinks;
                            const firstLink = group.links[0];
                            const isExpanded = expandedGroups.has(group.fileId);

                            return (
                                <motion.div
                                    key={`group-${group.fileId}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -16 }}
                                    transition={{ delay: (folders.length + idx) * 0.04, duration: 0.2 }}
                                    className="bg-background border border-border/60 rounded-2xl overflow-hidden hover:border-border hover:shadow-lg hover:shadow-black/[0.04] transition-all duration-150"
                                >
                                    {/* Group header */}
                                    <div
                                        className="flex items-center gap-4 p-4 cursor-pointer"
                                        onClick={() => {
                                            const next = new Set(expandedGroups);
                                            isExpanded ? next.delete(group.fileId) : next.add(group.fileId);
                                            setExpandedGroups(next);
                                        }}
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
                                            {getFileIcon(firstLink.file?.mimeType)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="text-sm font-bold text-foreground truncate">
                                                    {firstLink.file?.originalName || t("common.itemType.file")}
                                                </p>
                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                                                    {group.links.length} {t("links.title")}
                                                </span>
                                            </div>
                                            {firstLink.file && (
                                                <p className="text-[11px] text-muted-foreground font-medium">{formatSize(firstLink.file.size)}</p>
                                            )}
                                        </div>

                                        <div className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors shrink-0">
                                            {isExpanded
                                                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                            }
                                        </div>
                                    </div>

                                    {/* Expanded rows */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden border-t border-border/40"
                                            >
                                                <div className="p-3 space-y-2 bg-muted/20">
                                                    {group.links.map((link) => (
                                                        <div
                                                            key={link.id}
                                                            className="flex items-center gap-3 px-3 py-2.5 bg-background border border-border/50 rounded-xl"
                                                        >
                                                            {/* ID */}
                                                            <code className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg border border-primary/20 shrink-0">
                                                                /{link.id}
                                                            </code>

                                                            {/* Badges */}
                                                            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                                                                {link.isPasswordProtected && <StatusBadge icon={Lock} label={t("talk.password")} variant="active" />}
                                                                {link.directDownload && <StatusBadge icon={Zap} label="Direct" variant="warning" />}
                                                                {link.isEmbed && <StatusBadge icon={Code} label="Embed" variant="embed" />}
                                                                {link.isExpired && <StatusBadge icon={AlertTriangle} label="Expirado" variant="danger" />}
                                                                {!link.isExpired && link.expiresAt && (
                                                                    <StatusBadge icon={Clock} label={timeUntilExpiry(link.expiresAt)} variant="info" />
                                                                )}
                                                                <span className="text-[10px] text-muted-foreground ml-1">
                                                                    {link.views} vistas
                                                                </span>
                                                            </div>

                                                            {/* Actions */}
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    onClick={() => handleCopy(link.id)}
                                                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                    title={t("common.copy")}
                                                                >
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                </button>
                                                                {link.isEmbed && (
                                                                    <button
                                                                        onClick={() => handleCopyEmbed(link.id)}
                                                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                        title="Copiar URL embed"
                                                                    >
                                                                        <Code className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => window.open(`/s/${link.id}`, "_blank")}
                                                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                    title={t("gallery.view")}
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => confirmDelete(link.id)}
                                                                    disabled={!canDeleteLinks()}
                                                                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
                                                                    title={t("common.delete")}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        }

                        // ── Single link ──
                        const link = item as LinkItem;

                        return (
                            <motion.div
                                key={link.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ delay: (folders.length + idx) * 0.04, duration: 0.2 }}
                                className={cn(
                                    "group bg-background border border-border/60 rounded-2xl hover:border-border hover:shadow-lg hover:shadow-black/[0.04] transition-all duration-150 overflow-hidden",
                                    link.isExpired && "opacity-60 saturate-0"
                                )}
                            >
                                <div className="flex items-center gap-4 p-4">

                                    {/* File icon */}
                                    <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
                                        {getFileIcon(link.file?.mimeType)}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 min-w-0">
                                            <p className="text-sm font-bold text-foreground truncate">
                                                {link.file?.originalName || link.folder?.name || t("common.itemType.file")}
                                            </p>
                                            {link.isExpired && (
                                                <StatusBadge icon={AlertTriangle} label="Expirado" variant="danger" />
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 flex-wrap">
                                            {/* Link ID */}
                                            <code className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                                                /{link.id}
                                            </code>

                                            {/* File size */}
                                            {link.file && (
                                                <span className="text-[11px] text-muted-foreground font-medium">
                                                    {formatSize(link.file.size)}
                                                </span>
                                            )}

                                            {/* Views */}
                                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                                <Eye className="w-3 h-3" />
                                                {link.views}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Controls */}
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

                                        {/* Password toggle */}
                                        <button
                                            onClick={() => openPasswordModal(link)}
                                            disabled={!canDeleteLinks()}
                                            title={link.isPasswordProtected ? "Quitar contraseña" : "Añadir contraseña"}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
                                                link.isPasswordProtected
                                                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20 hover:brightness-110"
                                                    : "bg-transparent border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                            )}
                                        >
                                            {link.isPasswordProtected
                                                ? <><Lock className="w-3 h-3" /> {t("talk.password")}</>
                                                : <><Globe className="w-3 h-3" /> Público</>
                                            }
                                        </button>

                                        {/* Expiry toggle */}
                                        <button
                                            onClick={() => openExpiryModal(link)}
                                            disabled={!canDeleteLinks()}
                                            title="Gestionar expiración"
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
                                                link.isExpired
                                                    ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400"
                                                    : link.expiresAt
                                                    ? "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 hover:brightness-95"
                                                    : "bg-transparent border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                            )}
                                        >
                                            <Clock className="w-3 h-3" />
                                            {link.isExpired
                                                ? "Expirado"
                                                : link.expiresAt
                                                ? timeUntilExpiry(link.expiresAt)
                                                : t("links.never")}
                                        </button>

                                        {/* Separator */}
                                        <div className="w-px h-6 bg-border/60 hidden sm:block" />

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1">
                                            <ActionButton
                                                icon={Copy}
                                                label={t("common.copy")}
                                                onClick={() => handleCopy(link.id)}
                                            />
                                            <ActionButton
                                                icon={ExternalLink}
                                                label={t("gallery.view")}
                                                onClick={() => window.open(`/s/${link.id}`, "_blank")}
                                            />
                                            <ActionButton
                                                icon={Trash2}
                                                label={t("common.delete")}
                                                onClick={() => confirmDelete(link.id)}
                                                variant="danger"
                                                disabled={!canDeleteLinks()}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom badges strip */}
                                {(link.directDownload || link.isEmbed) && (
                                    <div className="flex items-center gap-2 px-4 pb-3">
                                        {link.directDownload && (
                                            <StatusBadge icon={Zap} label="Descarga directa" variant="warning" />
                                        )}
                                        {link.isEmbed && (
                                            <>
                                                <StatusBadge icon={Code} label="Embed" variant="embed" />
                                                <button
                                                    onClick={() => handleCopyEmbed(link.id)}
                                                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-dotted"
                                                >
                                                    Copiar URL embed
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="h-16" />

            {/* ── Modals ── */}

            {/* Delete confirm */}
            <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title={t("links.delete")}>
                <div className="space-y-5">
                    <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-400">{t("links.confirmDelete")}</p>
                    </div>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>{t("common.cancel")}</Button>
                        <Button variant="destructive" onClick={handleDelete}>{t("common.delete")}</Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Password */}
            <Modal isOpen={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Proteger con contraseña">
                <div className="space-y-5">
                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl border border-border/40">
                        <Shield className="w-5 h-5 text-primary shrink-0" />
                        <p className="text-sm text-muted-foreground">Solo quienes tengan la contraseña podrán acceder a este enlace.</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold">{t("talk.password")}</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t("talk.passwordPlaceholder")}
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && linkToProtect && handleTogglePassword(linkToProtect)}
                        />
                    </div>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setPasswordModalOpen(false)}>{t("common.cancel")}</Button>
                        <Button onClick={() => linkToProtect && handleTogglePassword(linkToProtect)} disabled={!newPassword}>
                            {t("common.save")}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Expiry */}
            <Modal isOpen={expiryModalOpen} onClose={() => setExpiryModalOpen(false)} title="Configurar expiración">
                <div className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold">Expira en (minutos)</label>
                        <Input
                            type="number"
                            value={expiryMinutes}
                            onChange={(e) => setExpiryMinutes(e.target.value)}
                            placeholder="ej. 60 = 1 hora, 1440 = 1 día"
                            autoFocus
                            min="1"
                            onKeyDown={(e) => e.key === "Enter" && handleSetExpiry()}
                        />
                        <p className="text-[11px] text-muted-foreground">Deja vacío o pon 0 para no limitar.</p>
                    </div>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setExpiryModalOpen(false)}>{t("common.cancel")}</Button>
                        <Button onClick={handleSetExpiry} disabled={!expiryMinutes || parseInt(expiryMinutes) <= 0}>
                            {t("common.save")}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Copy success */}
            <Modal isOpen={copyModalOpen} onClose={() => setCopyModalOpen(false)} title="Enlace copiado">
                <div className="space-y-5">
                    <div className="flex items-center justify-center">
                        <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                            <Check className="w-7 h-7 text-green-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL del enlace</label>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={copiedUrl}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                className="flex-1 bg-muted/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm font-mono text-foreground select-all focus:outline-none focus:border-primary/40 transition-all"
                            />
                            <button
                                onClick={() => copyToClipboard(copiedUrl)}
                                className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:brightness-110 transition-all shrink-0"
                                title={t("common.copy")}
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <ModalFooter>
                        <Button className="w-full h-11 font-bold rounded-xl" onClick={() => setCopyModalOpen(false)}>
                            {t("common.close")}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>
        </div>
    );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function SharedLinksPage() {
    const { t } = useTranslation();
    return (
        <Suspense
            fallback={
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">{t("common.loading")}</p>
                </div>
            }
        >
            <SharedLinksContent />
        </Suspense>
    );
}