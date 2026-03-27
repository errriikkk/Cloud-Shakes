"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Check, Filter, Globe, Lock, Pin, Plus, Search, StickyNote, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useModal } from "@/hooks/useModal";
import { useTranslation } from "@/lib/i18n";
import { ActivityAvatar } from "@/components/ActivityAvatar";
import { usePermission } from "@/hooks/usePermission";
import { PermissionGuard } from "@/components/PermissionGuard";

interface Note {
    id: string;
    title: string;
    content: string;
    scope?: "private" | "workspace";
    color: string;
    pinned: boolean;
    updatedAt: string;
    createdAt?: string;
    owner?: { id: string; username: string; displayName: string };
    lastModifiedBy?: { id: string; username: string; displayName: string } | null;
}

const COLORS = [
    { name: "default", ring: "ring-border", dot: "bg-muted-foreground/40" },
    { name: "yellow", ring: "ring-yellow-200 dark:ring-yellow-800/60", dot: "bg-yellow-400" },
    { name: "green", ring: "ring-green-200 dark:ring-green-800/60", dot: "bg-green-500" },
    { name: "blue", ring: "ring-blue-200 dark:ring-blue-800/60", dot: "bg-blue-500" },
    { name: "purple", ring: "ring-purple-200 dark:ring-purple-800/60", dot: "bg-purple-500" },
    { name: "red", ring: "ring-red-200 dark:ring-red-800/60", dot: "bg-red-500" },
] as const;

const scopeBadge = (scope?: string) => {
    if (scope === "workspace") return { icon: Globe, label: "Team", cls: "bg-primary/10 text-primary border-primary/20" };
    return { icon: Lock, label: "Private", cls: "bg-muted/60 text-muted-foreground border-border/40" };
};

export default function NotesPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { confirm, alert, ModalComponents } = useModal();
    const { canViewNotes, canCreateNotes, canEditNotes, canDeleteNotes } = usePermission();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [q, setQ] = useState("");
    const [scope, setScope] = useState<"all" | "private" | "workspace">("all");
    const [author, setAuthor] = useState<"all" | "me">("all");
    const [showPinnedOnly, setShowPinnedOnly] = useState(false);

    useEffect(() => {
        if (user && (user.isAdmin || user.permissions?.includes('view_notes'))) {
            fetchNotes();
        }
    }, [user]);

    const fetchNotes = async () => {
        try {
            const res = await axios.get(API_ENDPOINTS.NOTES.BASE, {
                withCredentials: true,
                params: {
                    scope,
                    q: q.trim().length >= 2 ? q.trim() : undefined,
                    pinned: showPinnedOnly ? true : undefined,
                    authorId: author === "me" ? user?.id : undefined,
                    limit: 100,
                }
            });
            // Handle both old array and new {data, pagination} format
            const notes = res.data.data || res.data || [];
            setNotes(notes);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const res = await axios.post(API_ENDPOINTS.NOTES.BASE, {
                title: "",
                content: "",
                color: "default",
                scope: scope === "workspace" ? "workspace" : "private",
            }, { withCredentials: true });
            setNotes(prev => [res.data, ...prev]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async (id: string, data: Partial<Note>) => {
        // Optimistic update
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
        try {
            await axios.put(API_ENDPOINTS.NOTES.DETAIL(id), data, { withCredentials: true });
        } catch (err) {
            console.error(err);
            // Revert on failure? For now just log
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm(
            t('notes.delete'),
            t('notes.confirmDelete'),
            { type: 'danger', confirmText: t('common.delete'), cancelText: t('common.cancel') }
        );
        if (!confirmed) return;
        setNotes(prev => prev.filter(n => n.id !== id));
        try {
            await axios.delete(API_ENDPOINTS.NOTES.DETAIL(id), { withCredentials: true });
        } catch (err) {
            console.error(err);
            await alert(t('common.error'), t('common.error'), { type: 'danger' });
        }
    };

    const pinnedNotes = useMemo(() => notes.filter(n => n.pinned), [notes]);
    const timelineNotes = useMemo(() => notes.filter(n => !n.pinned), [notes]);

    return (
        <PermissionGuard permission="view_notes" redirectUrl="/dashboard/home">
            <ModalComponents />
            <div className="pb-20 md:pb-0">
                {/* Header (linear, workspace-first) */}
                <div className="sticky top-0 z-10 -mx-4 md:-mx-8 border-b border-border bg-background/85 backdrop-blur">
                    <div className="mx-auto w-full max-w-[1400px] px-4 py-4 md:px-8">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h1 className="text-2xl font-bold tracking-tight">{t('notes.title')}</h1>
                                <p className="text-muted-foreground text-sm">
                                    Linear notes for you + your team.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={fetchNotes}
                                    variant="ghost"
                                    className="hidden sm:inline-flex"
                                    title={t("common.refresh") || "Refresh"}
                                >
                                    <Filter className="w-4 h-4 mr-2" />
                                    Refresh
                                </Button>
                                <Button
                                    onClick={handleCreate}
                                    disabled={isCreating || !canCreateNotes()}
                                    title={canCreateNotes() ? t('notes.newNote') : t('chat.noPermission')}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('notes.newNote')}
                                </Button>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") fetchNotes();
                                    }}
                                    placeholder={t("notes.search") || "Search notes..."}
                                    className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <TogglePill
                                    active={scope === "all"}
                                    onClick={() => setScope("all")}
                                    icon={StickyNote}
                                    label="All"
                                />
                                <TogglePill
                                    active={scope === "workspace"}
                                    onClick={() => setScope("workspace")}
                                    icon={Globe}
                                    label="Team"
                                />
                                <TogglePill
                                    active={scope === "private"}
                                    onClick={() => setScope("private")}
                                    icon={Lock}
                                    label="Private"
                                />
                                <div className="h-6 w-px bg-border mx-1" />
                                <TogglePill
                                    active={author === "all"}
                                    onClick={() => setAuthor("all")}
                                    icon={User}
                                    label="Everyone"
                                />
                                <TogglePill
                                    active={author === "me"}
                                    onClick={() => setAuthor("me")}
                                    icon={Check}
                                    label="Me"
                                />
                                <div className="h-6 w-px bg-border mx-1" />
                                <TogglePill
                                    active={showPinnedOnly}
                                    onClick={() => setShowPinnedOnly(v => !v)}
                                    icon={Pin}
                                    label="Pinned"
                                />
                                <Button
                                    variant="outline"
                                    className="h-9 rounded-xl"
                                    onClick={() => fetchNotes()}
                                >
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

            {loading ? (
                <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-24 rounded-2xl border border-border/50 bg-muted/20 animate-pulse" />
                        ))}
                    </div>
                </div>
            ) : notes.length === 0 ? (
                <div className="mx-auto w-full max-w-[1400px] px-4 py-16 md:px-8">
                    <div className="text-center text-muted-foreground">
                        <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">{t('notes.noNotes')}</p>
                        <p className="mt-2 text-xs text-muted-foreground/80">
                            Create a private note for yourself or a team note for everyone.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
                    {/* Pinned */}
                    {pinnedNotes.length > 0 && !showPinnedOnly && (
                        <div className="mb-6">
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                <Pin className="h-3.5 w-3.5" />
                                Pinned
                            </div>
                            <div className="space-y-2">
                                <AnimatePresence initial={false}>
                                    {pinnedNotes.map(note => (
                                        <NoteRow
                                            key={note.id}
                                            note={note}
                                            canDelete={canDeleteNotes()}
                                            canEdit={canEditNotes()}
                                            onUpdate={handleUpdate}
                                            onDelete={handleDelete}
                                            t={t}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {/* Timeline */}
                    <div className="space-y-2">
                        <AnimatePresence initial={false}>
                            {timelineNotes.map(note => (
                                <NoteRow
                                    key={note.id}
                                    note={note}
                                    canDelete={canDeleteNotes()}
                                    canEdit={canEditNotes()}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                    t={t}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}
            </div>
        </PermissionGuard>
    );
}

function TogglePill({
    active,
    onClick,
    icon: Icon,
    label
}: {
    active: boolean;
    onClick: () => void;
    icon: any;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors",
                active ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
        >
            <Icon className="h-4 w-4" />
            {label}
        </button>
    );
}

function NoteRow({
    note,
    canDelete,
    canEdit,
    onUpdate,
    onDelete,
    t
}: {
    note: Note;
    canDelete: boolean;
    canEdit: boolean;
    onUpdate: (id: string, data: Partial<Note>) => void;
    onDelete: (id: string) => void;
    t: any;
}) {
    const [title, setTitle] = useState(note.title);
    const [content, setContent] = useState(note.content);
    const [isSyncing, setIsSyncing] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const badge = scopeBadge(note.scope);
    const BadgeIcon = badge.icon;
    const color = COLORS.find(c => c.name === (note.color as any)) || COLORS[0];

    const debouncedSave = (newTitle: string, newContent: string) => {
        if (!canEdit) return;
        setIsSyncing(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await axios.put(API_ENDPOINTS.NOTES.DETAIL(note.id), {
                    title: newTitle,
                    content: newContent
                }, { withCredentials: true });
            } catch (err) {
                console.error("Save failed:", err);
            } finally {
                setIsSyncing(false);
            }
        }, 1200);
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTitle(val);
        debouncedSave(val, content);
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContent(val);
        debouncedSave(title, val);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
                "group rounded-2xl border border-border bg-background p-4 transition-shadow hover:shadow-sm"
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-1 flex flex-col items-center">
                    <span className={cn("h-2.5 w-2.5 rounded-full", color.dot)} />
                    <span className="mt-2 h-full w-px bg-border/60" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
                                    <BadgeIcon className="h-3.5 w-3.5" />
                                    {badge.label}
                                </span>
                                <span className="text-[11px] font-medium text-muted-foreground">
                                    {note.lastModifiedBy?.displayName || note.owner?.displayName || "—"}
                                </span>
                                <span className="text-[11px] text-muted-foreground/70">
                                    · {new Date(note.updatedAt).toLocaleString()}
                                </span>
                                {isSyncing && (
                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                        · {t("common.saving")}
                                    </span>
                                )}
                            </div>

                            <input
                                type="text"
                                value={title}
                                placeholder={t('notes.untitled')}
                                onChange={handleTitleChange}
                                disabled={!canEdit}
                                className={cn(
                                    "mt-2 w-full truncate rounded-lg bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-muted/30 focus:bg-muted/40",
                                    !canEdit && "opacity-70 cursor-not-allowed"
                                )}
                            />
                        </div>

                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
                                disabled={!canEdit}
                                className={cn(
                                    "rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed",
                                    note.pinned && "text-primary"
                                )}
                                aria-label="Pin"
                            >
                                <Pin className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => (canDelete ? onDelete(note.id) : null)}
                                disabled={!canDelete}
                                title={canDelete ? t('common.delete') : t('chat.noPermission')}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="Delete"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <textarea
                        value={content}
                        placeholder={t('notes.untitled')}
                        onChange={handleContentChange}
                        disabled={!canEdit}
                        className={cn(
                            "mt-2 w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 hover:bg-muted/20 focus:border-border focus:bg-muted/20",
                            !canEdit && "opacity-70 cursor-not-allowed"
                        )}
                        rows={Math.min(10, Math.max(3, Math.ceil((content?.length || 0) / 80)))}
                    />

                    <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ActivityAvatar
                                user={note.lastModifiedBy || note.owner}
                                resourceId={note.id}
                                resourceType="note"
                            />
                            <div className="flex items-center gap-1.5">
                                {COLORS.slice(1).map(c => (
                                    <button
                                        key={c.name}
                                        onClick={() => onUpdate(note.id, { color: c.name as any })}
                                        disabled={!canEdit}
                                        className={cn(
                                            "h-5 w-5 rounded-full ring-2 ring-transparent transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                                            c.dot,
                                            c.name === note.color && c.ring
                                        )}
                                        aria-label={`Color ${c.name}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <button
                            className={cn(
                                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/30",
                                "border-border/60"
                            )}
                            disabled={!canEdit}
                            onClick={() => onUpdate(note.id, { scope: note.scope === "workspace" ? "private" : "workspace" })}
                            title={!canEdit ? t("chat.noPermission") : "Toggle visibility"}
                        >
                            {note.scope === "workspace" ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {note.scope === "workspace" ? "Team" : "Private"}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
