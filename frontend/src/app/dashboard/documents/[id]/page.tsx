"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Loader2, MoreHorizontal, Trash2, Bold as BoldIcon, Italic as ItalicIcon, List, Heading1, Heading2, Underline as UnderlineIcon, Share2, Check } from "lucide-react";
import { ShareDocumentModal } from "@/components/ShareDocumentModal";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useModal } from "@/hooks/useModal";
import { useTranslation } from "@/lib/i18n";

export default function DocumentEditorPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { confirm, alert, ModalComponents } = useModal();
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const [title, setTitle] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [existingLink, setExistingLink] = useState<any>(null);

    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        fetchDocument();
    }, [id]);

    const fetchDocument = async () => {
        try {
            const res = await axios.get(API_ENDPOINTS.DOCUMENTS.DETAIL(id), { withCredentials: true });
            setTitle(res.data.title || "");

            if (editorRef.current) {
                const c = res.data.content;
                if (c && c.html) {
                    editorRef.current.innerHTML = c.html;
                } else if (c && c.text) {
                    editorRef.current.innerText = c.text;
                } else if (typeof c === 'string') {
                    editorRef.current.innerText = c;
                }
            }
        } catch (err) {
            console.error("Failed to fetch doc:", err);
            router.push("/dashboard/documents");
        } finally {
            setLoading(false);
        }
    };

    const saveDocument = async (newTitle: string, html: string) => {
        setSaving(true);
        try {
            await axios.put(API_ENDPOINTS.DOCUMENTS.DETAIL(id), {
                title: newTitle,
                content: { type: 'rich-text', html }
            }, { withCredentials: true });
            setLastSaved(new Date());
            setIsDirty(false);
        } catch (err) {
            console.error("Failed to save:", err);
        } finally {
            setSaving(false);
        }
    };

    const debouncedSave = (newTitle: string, html: string) => {
        setIsDirty(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveDocument(newTitle, html);
        }, 800);
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTitle(val);
        if (editorRef.current) {
            debouncedSave(val, editorRef.current.innerHTML);
        }
    };

    const handleInput = () => {
        if (editorRef.current) {
            debouncedSave(title, editorRef.current.innerHTML);
        }
    };

    const handleManualSave = () => {
        if (editorRef.current) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveDocument(title, editorRef.current.innerHTML);
        }
    };

    const handleBack = async () => {
        if (isDirty || saving) {
            const confirmed = await confirm(
                t('documents.title'),
                t('documents.unsavedChanges'),
                { type: 'warning', confirmText: t('common.yes'), cancelText: t('common.no') }
            );
            if (!confirmed) return;
        }
        router.push("/dashboard/documents");
    };

    const execCommand = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            editorRef.current.focus();
            debouncedSave(title, editorRef.current.innerHTML);
        }
    };

    // Warn if leaving with unsaved changes (browser level)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty || saving) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty, saving]);

    const handleDelete = async () => {
        const confirmed = await confirm(
            t('documents.delete'),
            t('documents.confirmDelete'),
            { type: 'danger', confirmText: t('common.delete'), cancelText: t('common.cancel') }
        );
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.DOCUMENTS.DETAIL(id), { withCredentials: true });
            router.push("/dashboard/documents");
        } catch (err) {
            console.error("Delete failed:", err);
            await alert(t('common.error'), t('common.error'), { type: 'danger' });
        }
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center py-40"><Loader2 className="animate-spin opacity-50" /></div>;
    }

    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col min-h-[calc(100dvh-4rem)]">
            <ModalComponents />
            {/* Toolbar Top */}
            <div className="flex items-center justify-between py-4 shrink-0 px-2 sm:px-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <button 
                        onClick={handleBack}
                        className="p-2 hover:bg-muted rounded-xl transition-colors"
                        title={t('common.back')}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">{t('documents.title')}</span>
                        <span className="text-sm font-semibold text-foreground truncate max-w-[150px]">{title || t('documents.untitled')}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <div className="hidden sm:flex items-center gap-2 pr-2 border-r border-border/40">
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-all",
                            saving ? "bg-primary/10 text-primary animate-pulse" : isDirty ? "bg-amber-500/10 text-amber-600" : "bg-muted/50 text-muted-foreground"
                        )}>
                            {saving ? t('common.saving') : isDirty ? t('common.save') : lastSaved ? t('common.saved') : t('common.saved')}
                        </span>
                        {lastSaved && !isDirty && !saving && <Check className="w-3 h-3 text-emerald-500" />}
                    </div>

                    <Button 
                        size="sm"
                        variant={isDirty ? "default" : "outline"}
                        onClick={handleManualSave}
                        disabled={saving || (!isDirty && lastSaved !== null)}
                        className="h-9 rounded-xl font-bold shadow-sm"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        <span className="hidden sm:inline">{t('common.save')}</span>
                    </Button>

                    <button 
                        onClick={() => {
                            axios.get(API_ENDPOINTS.LINKS.BASE, { withCredentials: true })
                                .then(res => {
                                    const links = res.data.data || res.data || [];
                                    const docLink = links.find((l: any) => l.documentId === id);
                                    setExistingLink(docLink || null);
                                    setIsShareOpen(true);
                                })
                                .catch(() => {
                                    setExistingLink(null);
                                    setIsShareOpen(true);
                                });
                        }}
                        className="p-2 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                        title={t('common.share')}
                    >
                        <Share2 className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={handleDelete} 
                        className="p-2 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                        title={t('common.delete')}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Rich Text Toolbar */}
            <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border border-border/60 rounded-2xl p-1.5 mb-6 flex items-center gap-1 shadow-sm overflow-x-auto no-scrollbar mx-2 sm:mx-0">
                <ToolbarButton icon={BoldIcon} onClick={() => execCommand('bold')} label="Bold" />
                <ToolbarButton icon={ItalicIcon} onClick={() => execCommand('italic')} label="Italic" />
                <ToolbarButton icon={UnderlineIcon} onClick={() => execCommand('underline')} label="Underline" />
                <div className="w-px h-4 bg-border mx-1" />
                <ToolbarButton icon={Heading1} onClick={() => execCommand('formatBlock', 'h1')} label="H1" />
                <ToolbarButton icon={Heading2} onClick={() => execCommand('formatBlock', 'h2')} label="H2" />
                <div className="w-px h-4 bg-border mx-1" />
                <ToolbarButton icon={List} onClick={() => execCommand('insertUnorderedList')} label="List" />
            </div>

            {/* Editor Surface (Page Look) */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-40 px-2 sm:px-0">
                <div className="bg-background min-h-[1000px] rounded-xl sm:rounded-2xl border border-border/40 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-8 md:p-16 lg:px-24">
                    <input
                        type="text"
                        value={title}
                        onChange={handleTitleChange}
                        placeholder={t('documents.untitled')}
                        className="w-full text-4xl sm:text-5xl font-extrabold bg-transparent border-none outline-none placeholder:text-muted-foreground/20 mb-12 tracking-tight selection:bg-primary/20"
                    />
                    <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleInput}
                        data-placeholder={t('documents.placeholder')}
                        className="prose prose-slate max-w-none w-full outline-none text-lg sm:text-xl leading-relaxed text-foreground/80 selection:bg-primary/20 min-h-[600px]"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Share Modal */}
            <ShareDocumentModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                documentId={id}
                documentTitle={title}
                existingLink={existingLink}
            />
        </div>
    );
}

function ToolbarButton({ icon: Icon, onClick, label }: { icon: any, onClick: () => void, label: string }) {
    return (
        <button
            onClick={(e) => { e.preventDefault(); onClick(); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95"
            title={label}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
}
