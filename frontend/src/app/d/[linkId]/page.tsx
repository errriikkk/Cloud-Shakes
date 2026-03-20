"use client";

import { useState, useEffect, use, useCallback } from "react";
import { motion } from "framer-motion";
import { FileText, Lock, Loader2, AlertTriangle, Shield, Calendar, ExternalLink, LogIn, Sparkles, Cloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import axios from "axios";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

interface LinkData {
    id: string;
    type: string;
    isPasswordProtected: boolean;
    documentTitle?: string;
    expiresAt?: string;
}

interface DocumentData {
    id: string;
    title: string;
    content: any;
    updatedAt: string;
}

interface LinkError {
    response?: {
        status?: number;
        data?: {
            message?: string;
        };
    };
}

export default function PublicDocumentPage({ params }: { params: Promise<{ linkId: string }> }) {
    const { linkId } = use(params);
    const [linkData, setLinkData] = useState<LinkData | null>(null);
    const [documentData, setDocumentData] = useState<DocumentData | null>(null);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [expired, setExpired] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const fetchDocument = useCallback(async () => {
        try {
            const res = await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/links/${linkId}/verify`,
                { password: password || undefined }
            );
            if (res.data.document) {
                setDocumentData(res.data.document);
            }
        } catch (err: unknown) {
            const error = err as LinkError;
            setError(error.response?.data?.message || "Error al cargar el documento");
        }
    }, [linkId, password]);

    useEffect(() => {
        const fetchLink = async () => {
            try {
                const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/links/${linkId}`);
                setLinkData(res.data);

                // If not password protected, fetch document directly
                if (!res.data.isPasswordProtected && res.data.type === 'document') {
                    await fetchDocument();
                }
            } catch (err: unknown) {
                const error = err as LinkError;
                if (error.response?.status === 410) setExpired(true);
                else setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchLink();
    }, [linkId, fetchDocument]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifying(true);
        setError("");
        try {
            await fetchDocument();
        } catch (err: unknown) {
            const error = err as LinkError;
            setError(error.response?.data?.message || "Verificación fallida");
        } finally {
            setVerifying(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
                    <p className="text-sm text-muted-foreground">Cargando documento...</p>
                </motion.div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                    <h1 className="text-2xl font-bold text-foreground mb-2">Enlace no encontrado</h1>
                    <p className="text-muted-foreground">Este enlace no existe o ha sido eliminado.</p>
                </motion.div>
            </div>
        );
    }

    if (expired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                    <h1 className="text-2xl font-bold text-foreground mb-2">Enlace Expirado</h1>
                    <p className="text-muted-foreground">Este enlace ha expirado y ya no está disponible.</p>
                </motion.div>
            </div>
        );
    }

    // Password form
    if (linkData?.isPasswordProtected && !documentData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-background border border-border/60 rounded-2xl shadow-2xl p-8 w-full max-w-md"
                >
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Documento Protegido</h1>
                        <p className="text-muted-foreground">Este documento está protegido con contraseña.</p>
                    </div>

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Contraseña..."
                                className="w-full"
                                autoFocus
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-red-500 text-center">{error}</p>
                        )}
                        <Button
                            type="submit"
                            disabled={verifying || !password}
                            className="w-full"
                        >
                            {verifying ? "Verificando..." : "Acceder"}
                        </Button>
                    </form>
                </motion.div>
            </div>
        );
    }

    // Document preview
    if (documentData) {
        return (
            <div className="min-h-screen bg-background">
                {/* Header */}
                <div className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="max-w-4xl mx-auto px-4 py-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold text-foreground">{documentData.title}</h1>
                                    <p className="text-xs text-muted-foreground">
                                        Actualizado {format(new Date(documentData.updatedAt), "d 'de' MMMM, yyyy", { locale: es })}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Shield className="w-4 h-4" />
                                <span className="hidden sm:inline">Documento Compartido</span>
                            </div>
                        </div>
                        
                        {/* Cloud Shakes Branding & Actions */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-border/20">
                            <div className="flex items-center gap-2">
                                <Cloud className="w-4 h-4 text-primary" />
                                <span className="text-xs font-semibold text-foreground">Cloud Shakes</span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">Documento compartido de forma segura</span>
                            </div>
                            <Link href="/dashboard" className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                                <LogIn className="w-3.5 h-3.5" />
                                <span>Ir a Cloud Shakes</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Document Content */}
                <div className="max-w-4xl mx-auto px-4 py-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-background rounded-2xl border border-border/40 shadow-sm p-8 md:p-16"
                    >
                        <div
                            className="prose prose-slate max-w-none w-full"
                            dangerouslySetInnerHTML={{
                                __html: documentData.content?.html || 
                                        (typeof documentData.content === 'string' ? documentData.content : '') ||
                                        '<p>Documento vacío</p>'
                            }}
                        />
                    </motion.div>

                    {/* Suggestions Banner */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Sparkles className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-foreground mb-1">¿Te gusta este documento?</h3>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Únete a Cloud Shakes para crear, compartir y colaborar en documentos de forma segura.
                                </p>
                                <Link href="/dashboard">
                                    <Button className="rounded-xl text-xs font-bold h-9">
                                        Crear cuenta gratuita
                                        <ExternalLink className="w-3.5 h-3.5 ml-2" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    return null;
}

