"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, Download, Clock, FileText, Image as ImageIcon, Video, Music, Cloud, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import axios from "axios";
import { useBranding } from "@/lib/branding";
import { BuiltWithBadge } from "@/components/BuiltWithBadge";
import { useTranslation } from "@/lib/i18n";

interface LinkData {
    id: string;
    isPasswordProtected: boolean;
    fileName?: string;
    mimeType?: string;
    expiresAt?: string;
    directDownload: boolean;
}

export default function PublicLinkPage({ params }: { params: Promise<{ linkId: string }> }) {
    const { linkId } = use(params);
    const { cloudName, logoUrl } = useBranding();
    const { locale, setLocale } = useTranslation();
    const [linkData, setLinkData] = useState<LinkData | null>(null);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [expired, setExpired] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [redirecting, setRedirecting] = useState(false);

    useEffect(() => {
        const fetchLink = async () => {
            try {
                const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/links/${linkId}`);
                setLinkData(res.data);

                // Auto-download if directDownload is enabled and not password protected
                if (res.data.directDownload && !res.data.isPasswordProtected) {
                    handleAutoDownload(linkId);
                    return; // Don't show any UI
                }
            } catch (err: any) {
                if (err.response?.status === 410) setExpired(true);
                else setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchLink();
    }, [linkId]);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

    const handleAutoDownload = async (id: string) => {
        try {
            // Verificamos el enlace (sin password) para incrementar vistas / validar expiración
            await axios.post(
                `${API_BASE}/api/links/${id}/verify`,
                {}
            );
            // Y usamos siempre el endpoint interno de descarga pública
            window.location.href = `${API_BASE}/api/links/${id}/download`;
        } catch (err) {
            console.error("Auto download failed", err);
            setRedirecting(false); // Fallback to manual
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifying(true);
        setError("");
        try {
            await axios.post(
                `${API_BASE}/api/links/${linkId}/verify`,
                { password: password || undefined }
            );
            window.location.href = `${API_BASE}/api/links/${linkId}/download`;
        } catch (err: any) {
            setError(err.response?.data?.message || "Verification failed");
        } finally {
            setVerifying(false);
        }
    };

    const handleDownload = async () => {
        setVerifying(true);
        try {
            await axios.post(
                `${API_BASE}/api/links/${linkId}/verify`,
                {}
            );
            window.location.href = `${API_BASE}/api/links/${linkId}/download`;
        } catch (err: any) {
            setError(err.response?.data?.message || "Download failed");
        } finally {
            setVerifying(false);
        }
    };

    const getFileIcon = (mimeType?: string) => {
        const iconClass = "w-10 h-10";
        if (!mimeType) return <FileText className={`${iconClass} text-muted-foreground/40`} />;
        if (mimeType.startsWith('image/')) return <ImageIcon className={`${iconClass} text-blue-500`} />;
        if (mimeType.startsWith('video/')) return <Video className={`${iconClass} text-purple-500`} />;
        if (mimeType.startsWith('audio/')) return <Music className={`${iconClass} text-pink-500`} />;
        if (mimeType.includes('pdf')) return <FileText className={`${iconClass} text-orange-500`} />;
        return <FileText className={`${iconClass} text-muted-foreground/40`} />;
    };

    if (loading || redirecting) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfdfc] p-4 text-muted-foreground">
                <div className="w-full max-w-md flex justify-end mb-6">
                    <button
                        type="button"
                        onClick={() => setLocale(locale === "es" ? "en" : "es")}
                        className="px-3 py-1.5 rounded-full border border-border/60 bg-background/80 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title="Language"
                    >
                        {locale === "es" ? "ES" : "EN"}
                    </button>
                </div>
                <Loader2 className="w-10 h-10 animate-spin mb-6 text-primary/40" />
                <p className="text-xs font-bold uppercase tracking-widest opacity-60">
                    {redirecting ? "Preparing your file..." : "Scanning Drive..."}
                </p>
                <div className="mt-8">
                    <BuiltWithBadge />
                </div>
            </div>
        );
    }

    if (notFound || expired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fdfdfc] p-4 font-sans">
                <div className="w-full max-w-md bg-background border border-border/60 rounded-[2.5rem] p-12 text-center shadow-2xl shadow-black/[0.03]">
                    <div className="flex justify-end -mt-4 mb-6">
                        <button
                            type="button"
                            onClick={() => setLocale(locale === "es" ? "en" : "es")}
                            className="px-3 py-1.5 rounded-full border border-border/60 bg-background/80 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            title="Language"
                        >
                            {locale === "es" ? "ES" : "EN"}
                        </button>
                    </div>

                    {/* Brand Logo */}
                    <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-primary/10 overflow-hidden">
                        <img src={logoUrl || "/logo-512.png"} alt={cloudName} className="w-full h-full object-cover" />
                    </div>

                    <h2 className="text-2xl font-extrabold text-foreground tracking-tightest mb-4">
                        {expired ? "Enlace Expirado" : "Enlace No Encontrado"}
                    </h2>

                    <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-[280px] mx-auto mb-8">
                        {expired
                            ? "Este enlace compartido ha caducado y ya no está disponible."
                            : "Este enlace no existe o ha sido eliminado por el propietario."
                        }
                    </p>

                    <Button
                        className="w-full h-12 rounded-xl font-bold bg-primary text-white hover:opacity-90 shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
                        onClick={() => window.location.href = '/dashboard'}
                    >
                        Volver al Dashboard
                    </Button>
                    <div className="mt-6">
                        <BuiltWithBadge />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#fdfdfc] p-4 font-sans selection:bg-primary/10 selection:text-primary">
            <div className="w-full max-w-md">
                <div className="flex justify-end mb-6">
                    <button
                        type="button"
                        onClick={() => setLocale(locale === "es" ? "en" : "es")}
                        className="px-3 py-1.5 rounded-full border border-border/60 bg-background/80 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title="Language"
                    >
                        {locale === "es" ? "ES" : "EN"}
                    </button>
                </div>

                {/* Brand Header */}
                <div className="flex flex-col items-center mb-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shadow-sm border border-primary/10 shrink-0 overflow-hidden">
                            <img src={logoUrl || "/logo-512.png"} alt={cloudName} className="w-full h-full object-cover" />
                        </div>
                        <span className="font-extrabold text-2xl text-foreground tracking-tightest">{cloudName}</span>
                    </div>
                    <p className="text-muted-foreground/60 text-[10px] font-bold uppercase tracking-widest">Recurso de Espacio Premium</p>
                </div>

                {/* Main Card */}
                <div className="bg-background border border-border/60 rounded-[2.5rem] shadow-2xl shadow-black/[0.03] overflow-hidden">

                    {/* File Header */}
                    <div className="p-10 border-b border-border/40 bg-muted/20 text-center">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-background mb-6 shadow-xl shadow-black/[0.04] border border-border/60">
                            {getFileIcon(linkData?.mimeType)}
                        </div>
                        <h2 className="text-xl font-bold text-foreground truncate px-4 leading-tight" title={linkData?.fileName}>
                            {linkData?.fileName}
                        </h2>

                        {/* Meta Tags */}
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                            {linkData?.isPasswordProtected && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-primary text-white shadow-sm shadow-primary/10">
                                    <Lock className="w-3.5 h-3.5" /> Locked
                                </span>
                            )}
                            {linkData?.expiresAt && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-muted text-muted-foreground border border-border/60">
                                    <Clock className="w-3.5 h-3.5" /> Expires {new Date(linkData.expiresAt).toLocaleDateString()}
                                </span>
                            )}
                            {!linkData?.isPasswordProtected && !linkData?.expiresAt && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                    <Shield className="w-3.5 h-3.5" /> Public Access
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Action Area */}
                    <div className="p-10">
                        {linkData?.isPasswordProtected ? (
                            <form onSubmit={handleVerify} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">Unlock Code</label>
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter password..."
                                        className="bg-muted/40 border-border/60 rounded-2xl h-12 px-5 focus:bg-background transition-all"
                                        autoComplete="off"
                                    />
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="text-red-600 text-[13px] bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 font-medium"
                                        >
                                            <AlertTriangle className="w-4 h-4" />
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <Button
                                    type="submit"
                                    className="w-full h-12 rounded-2xl bg-primary text-white hover:opacity-90 font-bold shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
                                    disabled={verifying || !password}
                                    isLoading={verifying}
                                >
                                    {verifying ? "Verifying..." : "Unlock & Download"}
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="text-red-600 text-[13px] bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 font-medium mb-4"
                                        >
                                            <AlertTriangle className="w-4 h-4" />
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <Button
                                    onClick={handleDownload}
                                    className="w-full h-12 rounded-2xl bg-primary text-white hover:opacity-90 font-bold shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
                                    disabled={verifying}
                                    isLoading={verifying}
                                >
                                    <Download className="w-5 h-5 mr-3" />
                                    {verifying ? "Preparing..." : "Download File"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Dashboard Link */}
                <div className="mt-12 flex flex-col items-center gap-6">
                    <div className="flex items-center gap-3 py-2 px-5 bg-muted/40 rounded-full border border-border/40">
                        <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transferencia Segura de {cloudName}</span>
                    </div>

                    <a
                        href="/dashboard"
                        className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-all font-bold px-4 py-2 rounded-xl hover:bg-primary/5"
                    >
                        Entrar en {cloudName}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                    <BuiltWithBadge />
                </div>
            </div>
        </div>
    );
}
