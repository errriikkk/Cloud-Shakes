"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, StickyNote, RefreshCw, Pin, Trash2, Palette } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useModal } from "@/hooks/useModal";
import { ActivityAvatar } from "@/components/ActivityAvatar";

interface Note {
    id: string;
    title: string;
    content: string;
    color: string;
    pinned: boolean;
    updatedAt: string;
    owner?: { id: string; username: string; displayName: string };
    lastModifiedBy?: { id: string; username: string; displayName: string } | null;
}

const COLORS = [
    { name: "default", value: "bg-background border-border" },
    { name: "yellow", value: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800/50" },
    { name: "green", value: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800/50" },
    { name: "blue", value: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/50" },
    { name: "purple", value: "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/50" },
    { name: "red", value: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/50" },
];

export default function NotesPage() {
    const { user } = useAuth();
    const { confirm, alert, ModalComponents } = useModal();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchNotes();
    }, []);

    const fetchNotes = async () => {
        try {
            const res = await axios.get(API_ENDPOINTS.NOTES.BASE, { withCredentials: true });
            setNotes(res.data);
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
                color: "default"
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
            "Eliminar Nota",
            "¿Estás seguro de que quieres eliminar esta nota? Esta acción no se puede deshacer.",
            { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
        );
        if (!confirmed) return;
        setNotes(prev => prev.filter(n => n.id !== id));
        try {
            await axios.delete(API_ENDPOINTS.NOTES.DETAIL(id), { withCredentials: true });
        } catch (err) {
            console.error(err);
            await alert("Error", "No se pudo eliminar la nota. Por favor, intenta de nuevo.", { type: 'danger' });
        }
    };

    // Simple masonry-like grid using CSS columns
    return (
        <>
            <ModalComponents />
            <div className="space-y-6 pb-20 md:pb-0">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
                    <p className="text-muted-foreground text-sm">Ideas rápidas y recordatorios</p>
                </div>
                <Button onClick={handleCreate} disabled={isCreating}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Nota
                </Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-muted/30 rounded-2xl animate-pulse" />)}
                </div>
            ) : notes.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No tienes notas aún.</p>
                </div>
            ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                    <AnimatePresence>
                        {notes.map(note => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
        </>
    );
}

function NoteCard({ note, onUpdate, onDelete }: { note: Note, onUpdate: (id: string, data: Partial<Note>) => void, onDelete: (id: string) => void }) {
    const [title, setTitle] = useState(note.title);
    const [content, setContent] = useState(note.content);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const colorStyle = COLORS.find(c => c.name === note.color)?.value || COLORS[0].value;

    const debouncedSave = (newTitle: string, newContent: string) => {
        setIsSyncing(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await axios.put(API_ENDPOINTS.NOTES.DETAIL(note.id), {
                    title: newTitle,
                    content: newContent
                }, { withCredentials: true });
                setLastSynced(new Date());
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
                "break-inside-avoid relative group rounded-2xl border p-4 transition-all duration-300 shadow-sm hover:shadow-md",
                colorStyle
            )}
        >
            <div className="mb-2 flex items-start gap-2">
                <input
                    type="text"
                    value={title}
                    placeholder="Título"
                    onChange={handleTitleChange}
                    className="flex-1 bg-transparent font-bold text-lg placeholder:text-black/20 outline-none"
                />
                <button
                    onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
                    className={cn(
                        "p-1.5 rounded-full transition-colors shrink-0",
                        note.pinned ? "bg-black/10 text-black" : "text-black/20 hover:text-black/60"
                    )}
                >
                    <Pin className="w-3.5 h-3.5" />
                </button>
            </div>
            <textarea
                value={content}
                placeholder="Escribe algo..."
                onChange={handleContentChange}
                className="w-full bg-transparent resize-none outline-none text-sm min-h-[100px] placeholder:text-black/30 leading-relaxed"
            />

            <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                    <ActivityAvatar
                        user={note.lastModifiedBy || note.owner}
                        resourceId={note.id}
                        resourceType="note"
                    />
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-30">
                        {isSyncing ? "Sincronizando..." : lastSynced ? "Sincronizado" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-1">
                        {COLORS.slice(1).map(c => (
                            <button
                                key={c.name}
                                onClick={() => onUpdate(note.id, { color: c.name })}
                                className={cn(
                                    "w-3.5 h-3.5 rounded-full border border-black/10 transition-transform active:scale-90",
                                    c.name === note.color ? "ring-1 ring-black/30 scale-110" : ""
                                )}
                                style={{ backgroundColor: c.name === 'default' ? '#ffffff' : `var(--color-${c.name}-50)` }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => onDelete(note.id)}
                        className="p-1.5 text-black/30 hover:text-red-500 hover:bg-black/5 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
