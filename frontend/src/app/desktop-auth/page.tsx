"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Monitor, ShieldCheck, Cloud, ArrowRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.142:5000";

interface User {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string | null;
}

function DesktopAuthContent() {
    const searchParams = useSearchParams();
    const callbackPort = searchParams.get("port");
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [authorizing, setAuthorizing] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [error, setError] = useState("");

    // Check if user is logged in
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.AUTH.ME, {
                    withCredentials: true,
                });
                setUser(res.data);
            } catch {
                // User not logged in — redirect to login with return URL
                const returnUrl = `/desktop-auth?port=${callbackPort}`;
                window.location.href = `/?redirect=${encodeURIComponent(returnUrl)}`;
            } finally {
                setLoading(false);
            }
        };

        if (callbackPort) {
            checkAuth();
        } else {
            setError("Enlace de autorización inválido. Abre la app de escritorio e intenta de nuevo.");
            setLoading(false);
        }
    }, [callbackPort]);

    const handleAuthorize = async () => {
        if (!callbackPort || !user) return;

        setAuthorizing(true);
        setError("");

        try {
            // Get device tokens from authenticated session
            const res = await axios.post(`${API_URL}/api/auth/device-token`, {}, {
                withCredentials: true,
            });

            const { accessToken, refreshToken } = res.data;

            // Send tokens to desktop app's local callback server
            const callbackUrl = `http://localhost:${callbackPort}/callback`;

            try {
                await axios.post(callbackUrl, {
                    accessToken,
                    refreshToken,
                    username: user.username,
                    displayName: user.displayName || user.username,
                });
            } catch {
                // The redirect might cause a CORS issue in-browser, 
                // so also try via redirect as fallback
                const params = new URLSearchParams({
                    accessToken,
                    refreshToken,
                    username: user.username,
                });
                window.location.href = `${callbackUrl}?${params.toString()}`;
                return;
            }

            setAuthorized(true);
        } catch (err: any) {
            console.error("Authorization error:", err);
            if (err.response?.status === 401) {
                setError("Tu sesión ha expirado. Inicia sesión de nuevo.");
            } else {
                setError("Error al autorizar el dispositivo. Inténtalo de nuevo.");
            }
        } finally {
            setAuthorizing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#fdfdfc]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#fdfdfc] p-4 font-sans">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-primary/10 overflow-hidden">
                        <img src="/logo-512.png" alt="Cloud Shakes" className="w-full h-full object-cover" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-foreground tracking-tightest">
                        Shakes Cloud
                    </h1>
                </div>

                {/* Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-background border border-border/60 rounded-[2rem] shadow-2xl shadow-black/[0.03] p-8"
                >
                    {authorized ? (
                        /* Success State */
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">
                                ¡Dispositivo autorizado!
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Tu escritorio está conectado. Puedes cerrar esta ventana.
                                La sincronización comenzará automáticamente.
                            </p>
                        </div>
                    ) : (
                        /* Authorize State */
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Monitor className="w-6 h-6 text-blue-500" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground">
                                    Autorizar dispositivo
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    La aplicación de escritorio <strong>Shakes Cloud</strong> quiere acceder a tu cuenta
                                </p>
                            </div>

                            {/* User info */}
                            {user && (
                                <div className="bg-muted/40 border border-border/40 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                                        {user.displayName?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground text-sm">
                                            {user.displayName || user.username}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            @{user.username}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Permissions */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                    Permisos solicitados
                                </p>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3 text-sm text-foreground/80">
                                        <Cloud className="w-4 h-4 text-primary flex-shrink-0" />
                                        <span>Acceder a tus archivos y carpetas</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-foreground/80">
                                        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                                        <span>Sincronizar contenido al escritorio</span>
                                    </div>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-red-600 text-[13px] bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 font-medium"
                                >
                                    <XCircle className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </motion.div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => window.close()}
                                    className="flex-1 h-11 rounded-xl border border-border/60 bg-background text-foreground font-semibold text-sm hover:bg-muted/60 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAuthorize}
                                    disabled={authorizing}
                                    className="flex-1 h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10 disabled:opacity-60"
                                >
                                    {authorizing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            Autorizar
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-[11px] text-muted-foreground/60 font-medium">
                        &copy; {new Date().getFullYear()} Shakes CLOUD. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function DesktopAuthPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-[#fdfdfc]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        }>
            <DesktopAuthContent />
        </Suspense>
    );
}
