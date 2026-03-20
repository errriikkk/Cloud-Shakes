"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Plus, FileText, MoreHorizontal, Pencil, Trash2, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CreateLinkModal } from "@/components/CreateLinkModal";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useModal } from "@/hooks/useModal";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/lib/i18n";
import { PermissionGuard } from "@/components/PermissionGuard";

interface Document {
    id: string;
    title: string;
    updatedAt: string;
}

export default function DocumentsPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { confirm, alert, ModalComponents } = useModal();
    const router = useRouter();
    const { canViewDocuments, canCreateDocuments, canEditDocuments, canDeleteDocuments } = usePermission();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (user && (user.isAdmin || user.permissions?.includes('view_documents'))) {
            fetchDocuments();
        }
    }, [user]);

    const fetchDocuments = async () => {
        try {
            const res = await axios.get(API_ENDPOINTS.DOCUMENTS.BASE, { withCredentials: true });
            // Handle both old array and new {data, pagination} format
            const docs = res.data.data || res.data || [];
            setDocuments(docs);
        } catch (err) {
            console.error("Failed to fetch docs:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const res = await axios.post(API_ENDPOINTS.DOCUMENTS.BASE, {
                title: t('documents.untitled'),
                content: {} // Empty doc
            }, { withCredentials: true });
            router.push(`/dashboard/documents/${res.data.id}`);
        } catch (err) {
            console.error("Failed to create doc:", err);
            setIsCreating(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const confirmed = await confirm(
            t('documents.delete'),
            t('documents.confirmDelete'),
            { type: 'danger', confirmText: t('common.delete'), cancelText: t('common.cancel') }
        );
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.DOCUMENTS.DETAIL(id), { withCredentials: true });
            setDocuments(prev => prev.filter(d => d.id !== id));
        } catch (err) {
            console.error("Failed to delete doc:", err);
        }
    };

    const filteredDocs = documents.filter(doc =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <PermissionGuard permission="view_documents" redirectUrl="/dashboard/home">
            <ModalComponents />
            <div className="space-y-6 pb-20 md:pb-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('documents.title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('nav.documents')}</p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('documents.search')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border/60 rounded-xl text-sm focus:bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>
                    <Button onClick={handleCreate} disabled={isCreating || !canCreateDocuments()} className="shrink-0" title={canCreateDocuments() ? t('documents.newDocument') : t('chat.noPermission')}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('common.next')}
                    </Button>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-40 bg-muted/30 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : filteredDocs.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>{t('documents.noDocuments')}</p>
                    <Button variant="link" onClick={handleCreate}>{t('documents.newDocument')}</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence>
                        {filteredDocs.map((doc) => (
                            <motion.div
                                key={doc.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                onClick={() => router.push(`/dashboard/documents/${doc.id}`)}
                                className="group relative bg-background border border-border/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col h-48"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => canDeleteDocuments() ? handleDelete(e, doc.id) : null}
                                            disabled={!canDeleteDocuments()}
                                            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={canDeleteDocuments() ? t('common.delete') : t('chat.noPermission')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="font-semibold text-lg leading-tight mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                                    {doc.title || t('documents.untitled')}
                                </h3>
                                <div className="mt-auto flex items-center text-xs text-muted-foreground gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    <span>
                                        {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true, locale: es })}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
        </PermissionGuard>
    );
}
