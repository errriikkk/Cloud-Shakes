"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, X, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface PermissionGuardProps {
    permission: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    showMessage?: boolean;
    redirectUrl?: string;
}

export function PermissionGuard({
    permission,
    children,
    fallback = null,
    showMessage = true,
    redirectUrl
}: PermissionGuardProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (user) {
            const hasPermission = user.isAdmin || user.permissions?.includes(permission);
            if (!hasPermission && showMessage) {
                setShowModal(true);
            }
        }
    }, [user, permission, showMessage]);

    // No user
    if (!user) {
        return fallback;
    }

    const hasPermission = user.isAdmin || user.permissions?.includes(permission);

    // Has permission - render children
    if (hasPermission) {
        return <>{children}</>;
    }

    // No permission - show modal
    return (
        <>
            {fallback}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                    >
                        {/* Backdrop */}
                        <div 
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowModal(false)}
                        />
                        
                        {/* Modal */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6"
                        >
                            <button
                                onClick={() => setShowModal(false)}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            
                            <div className="flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                                    <Shield className="w-8 h-8 text-destructive" />
                                </div>
                                
                                <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
                                <p className="text-muted-foreground mb-4">
                                    No tienes permisos para realizar esta acción.
                                </p>
                                
                                <div className="bg-muted/50 rounded-lg p-3 w-full mb-4">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        <span>Permiso requerido: <code className="text-foreground font-mono">{permission}</code></span>
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 w-full">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
                                    >
                                        Cerrar
                                    </button>
                                    {redirectUrl && (
                                        <button
                                            onClick={() => {
                                                setShowModal(false);
                                                router.push(redirectUrl);
                                            }}
                                            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                                        >
                                            Volver
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// Hook for checking permissions with modal
export function usePermissionCheck() {
    const { user } = useAuth();
    const [deniedPermission, setDeniedPermission] = useState<string | null>(null);

    const checkPermission = (permission: string): boolean => {
        const hasPermission = user?.isAdmin || user?.permissions?.includes(permission);
        if (!hasPermission) {
            setDeniedPermission(permission);
            return false;
        }
        return true;
    };

    const clearDenied = () => setDeniedPermission(null);

    const PermissionDeniedModal = () => (
        <AnimatePresence>
            {deniedPermission && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                >
                    <div 
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={clearDenied}
                    />
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6"
                    >
                        <button
                            onClick={clearDenied}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                                <Shield className="w-8 h-8 text-destructive" />
                            </div>
                            
                            <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
                            <p className="text-muted-foreground mb-4">
                                No tienes permisos para realizar esta acción.
                            </p>
                            
                            <div className="bg-muted/50 rounded-lg p-3 w-full mb-4">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    <span>Permiso requerido: <code className="text-foreground font-mono">{deniedPermission}</code></span>
                                </div>
                            </div>
                            
                            <button
                                onClick={clearDenied}
                                className="w-full px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return { checkPermission, deniedPermission, clearDenied, PermissionDeniedModal };
}
