"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Link as LinkIcon, Lock, Clock, Globe, Eye, EyeOff, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { useModal } from "@/hooks/useModal";

interface ShareDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    documentTitle: string;
    existingLink?: any;
}

export function ShareDocumentModal({ isOpen, onClose, documentId, documentTitle, existingLink }: ShareDocumentModalProps) {
    const { alert, confirm, ModalComponents } = useModal();
    const [mounted, setMounted] = useState(false);
    const [password, setPassword] = useState("");
    const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
    const [customSlug, setCustomSlug] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, [isOpen]);

    useEffect(() => {
        if (existingLink) {
            const linkId = existingLink.customSlug || existingLink.id;
            setLinkUrl(`${window.location.origin}/d/${linkId}`);
            setCustomSlug(existingLink.customSlug || "");
        } else {
            setLinkUrl("");
            setCustomSlug("");
        }
        setPassword("");
        setExpiresInMinutes(null);
    }, [existingLink, isOpen]);

    const handleCreateLink = async () => {
        setLoading(true);
        try {
            const res = await axios.post(API_ENDPOINTS.LINKS.BASE, {
                documentId,
                password: password || undefined,
                expiresInMinutes: expiresInMinutes || undefined,
                customSlug: customSlug || undefined,
            }, { withCredentials: true });

            const linkId = res.data.customSlug || res.data.id;
            const newLinkUrl = `${window.location.origin}/d/${linkId}`;
            setLinkUrl(newLinkUrl);
        } catch (err: any) {
            console.error("Failed to create link:", err);
            await alert("Error", err.response?.data?.message || "Error al crear el enlace", { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateLink = async () => {
        if (!existingLink) return;
        setLoading(true);
        try {
            const res = await axios.put(API_ENDPOINTS.LINKS.BASE.replace('/api/links', `/api/links/${existingLink.id}`), {
                password: password || null,
                expiresInMinutes: expiresInMinutes,
                customSlug: customSlug || null,
            }, { withCredentials: true });

            const linkId = res.data.customSlug || res.data.id;
            const updatedLinkUrl = `${window.location.origin}/d/${linkId}`;
            setLinkUrl(updatedLinkUrl);
        } catch (err: any) {
            console.error("Failed to update link:", err);
            await alert("Error", err.response?.data?.message || "Error al actualizar el enlace", { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(linkUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevoke = async () => {
        if (!existingLink) return;
        const confirmed = await confirm(
            "Revocar Enlace",
            "¿Estás seguro de que quieres revocar este enlace? Ya no será accesible y esta acción no se puede deshacer.",
            { type: 'warning', confirmText: 'Revocar', cancelText: 'Cancelar' }
        );
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.LINKS.BASE.replace('/api/links', `/api/links/${existingLink.id}`), {
                withCredentials: true
            });
            setLinkUrl("");
            onClose();
        } catch (err) {
            console.error("Failed to revoke link:", err);
            await alert("Error", "Error al revocar el enlace", { type: 'danger' });
        }
    };

    if (!mounted || !isOpen) return null;

    const modalContent = (
        <>
            <ModalComponents />
            <AnimatePresence>
                <>
                    {/* Backdrop - Full screen coverage */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
                        onClick={onClose}
                        style={{
                            margin: 0,
                            padding: 0,
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100vw',
                            height: '100vh',
                        }}
                    />
                    {/* Modal Container - Centered on screen */}
                    <div 
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
                        style={{
                            margin: 0,
                            padding: '1rem',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100vw',
                            height: '100vh',
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            className="bg-background border border-border/60 rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-border/40">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <LinkIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Compartir Documento</h3>
                                <p className="text-xs text-muted-foreground">{documentTitle}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {/* Link URL Display */}
                        {linkUrl && (
                            <div className="p-4 bg-muted/30 rounded-xl border border-border/40">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    Enlace Compartido
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={linkUrl}
                                        readOnly
                                        className="flex-1 px-3 py-2 bg-background border border-border/60 rounded-lg text-sm font-mono focus:outline-none"
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                                    >
                                        {copied ? (
                                            <Check className="w-4 h-4" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Custom Slug */}
                        <div>
                            <label className="text-sm font-bold text-foreground block mb-2 flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                URL Personalizada (Opcional)
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground font-mono">
                                    {window.location.origin}/d/
                                </span>
                                <input
                                    type="text"
                                    value={customSlug}
                                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    placeholder="mi-documento"
                                    className="flex-1 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Solo letras, números y guiones. Déjalo vacío para URL automática.
                            </p>
                        </div>

                        {/* Password Protection */}
                        <div>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!password}
                                    onChange={(e) => {
                                        if (!e.target.checked) setPassword("");
                                    }}
                                    className="w-4 h-4 rounded border-border"
                                />
                                <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-bold text-foreground">Proteger con Contraseña</span>
                                </div>
                            </label>
                            {password !== "" && (
                                <div className="mt-3 relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Contraseña..."
                                        className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Expiration */}
                        <div>
                            <label className="text-sm font-bold text-foreground block mb-2 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Expiración
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setExpiresInMinutes(null)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                                        expiresInMinutes === null
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-foreground hover:bg-muted"
                                    )}
                                >
                                    Nunca
                                </button>
                                <button
                                    onClick={() => setExpiresInMinutes(60)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                                        expiresInMinutes === 60
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-foreground hover:bg-muted"
                                    )}
                                >
                                    1 Hora
                                </button>
                                <button
                                    onClick={() => setExpiresInMinutes(1440)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                                        expiresInMinutes === 1440
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-foreground hover:bg-muted"
                                    )}
                                >
                                    1 Día
                                </button>
                                <button
                                    onClick={() => setExpiresInMinutes(10080)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                                        expiresInMinutes === 10080
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-foreground hover:bg-muted"
                                    )}
                                >
                                    1 Semana
                                </button>
                            </div>
                            <input
                                type="number"
                                value={expiresInMinutes || ''}
                                onChange={(e) => setExpiresInMinutes(e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="O minutos personalizados..."
                                className="w-full mt-2 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-4 border-t border-border/40">
                            {existingLink && (
                                <button
                                    onClick={handleRevoke}
                                    className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg font-bold hover:bg-red-500/20 transition-colors"
                                >
                                    Revocar Enlace
                                </button>
                            )}
                            <button
                                onClick={existingLink ? handleUpdateLink : handleCreateLink}
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {loading ? "Guardando..." : existingLink ? "Actualizar" : "Crear Enlace"}
                            </button>
                        </div>
                    </div>
                </motion.div>
                    </div>
                </>
            </AnimatePresence>
        </>
    );

    return createPortal(modalContent, document.body);
}

