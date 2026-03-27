"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Shield, X, AlertTriangle, Lock, Folder, Upload, Trash2, 
    Download, Share2, Eye, FileText, MessageSquare, Users,
    Calendar, Image, Video, BarChart3, Activity, Settings,
    Mail, Plus, Edit3, Send, Play
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { LucideIcon } from "lucide-react";

interface PermissionGuardProps {
    permission: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    showMessage?: boolean;
    redirectUrl?: string;
}

const PERM_ICONS: Record<string, LucideIcon> = {
    admin: Shield,
    manage_users: Users,
    manage_roles: Shield,
    manage_settings: Settings,
    manage_integrations: Settings,
    view_files: Folder,
    view_shared_files: Folder,
    view_workspace_files: Folder,
    upload_files: Upload,
    delete_files: Trash2,
    download_files: Download,
    share_files: Share2,
    preview_files: Eye,
    create_folders: Folder,
    delete_folders: Trash2,
    organize_folders: Folder,
    view_notes: FileText,
    create_notes: FileText,
    edit_notes: Edit3,
    delete_notes: Trash2,
    view_calendar: Calendar,
    create_events: Calendar,
    edit_events: Edit3,
    delete_events: Trash2,
    view_links: Share2,
    create_links: Share2,
    delete_links: Trash2,
    view_gallery: Image,
    upload_images: Upload,
    delete_images: Trash2,
    view_chat: MessageSquare,
    send_messages: Send,
    edit_messages: Edit3,
    delete_messages: Trash2,
    create_chats: MessageSquare,
    create_group_chats: MessageSquare,
    mention_users: Users,
    send_attachments: Upload,
    view_calls: Video,
    create_calls: Video,
    manage_calls: Settings,
    join_calls: Play,
    view_statistics: BarChart3,
    export_statistics: Download,
    view_activity: Activity,
    export_activity: Download,
};

function getPermissionIcon(permission: string): LucideIcon {
    return PERM_ICONS[permission] || Lock;
}

function getPermissionColor(permission: string): string {
    const colors: Record<string, string> = {
        admin: "#ef4444",
        manage_users: "#f59e0b",
        manage_roles: "#f59e0b",
        manage_settings: "#8b5cf6",
        manage_integrations: "#8b5cf6",
        view_files: "#3b82f6",
        upload_files: "#10b981",
        delete_files: "#ef4444",
        download_files: "#3b82f6",
        share_files: "#ec4899",
        view_chat: "#06b6d4",
        send_messages: "#10b981",
        create_notes: "#10b981",
        create_events: "#10b981",
        upload_images: "#10b981",
    };
    return colors[permission] || "#6b7280";
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
    const { t } = useTranslation();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (user) {
            const hasPermission = user.isAdmin || user.permissions?.includes(permission);
            if (!hasPermission && showMessage) {
                setShowModal(true);
            }
        }
    }, [user, permission, showMessage]);

    if (!user) {
        return fallback;
    }

    const hasPermission = user.isAdmin || user.permissions?.includes(permission);

    if (hasPermission) {
        return <>{children}</>;
    }

    const PermIcon = getPermissionIcon(permission);
    const permColor = getPermissionColor(permission);
    const permLabel = t(`permissions.labels.${permission}`) || permission;

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
                        <div 
                            className="absolute inset-0 bg-black/70 backdrop-blur-md"
                            onClick={() => setShowModal(false)}
                        />
                        
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0, y: 20 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            className="relative bg-gradient-to-br from-card via-card to-card/95 border border-border/50 rounded-3xl shadow-2xl max-w-lg w-full p-8 overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
                            
                            <button
                                onClick={() => setShowModal(false)}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            
                            <div className="flex flex-col items-center text-center">
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring" }}
                                    className="relative mb-6"
                                >
                                    <div 
                                        className="w-24 h-24 rounded-3xl flex items-center justify-center"
                                        style={{ backgroundColor: `${permColor}15` }}
                                    >
                                        <PermIcon className="w-12 h-12" style={{ color: permColor }} />
                                    </div>
                                    <div 
                                        className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: permColor }}
                                    >
                                        <Lock className="w-4 h-4 text-white" />
                                    </div>
                                </motion.div>
                                
                                <motion.h2 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-2xl font-bold mb-2"
                                >
                                    {t('permissions.accessDenied')}
                                </motion.h2>
                                
                                <motion.p 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.35 }}
                                    className="text-muted-foreground mb-6"
                                >
                                    {t('permissions.youCannot')}
                                </motion.p>
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="w-full bg-gradient-to-r from-muted/50 to-muted/30 rounded-2xl p-4 mb-6 border border-border/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: `${permColor}20` }}
                                        >
                                            <AlertTriangle className="w-5 h-5" style={{ color: permColor }} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                                                {t('permissions.required')}
                                            </p>
                                            <p className="font-semibold" style={{ color: permColor }}>
                                                {permLabel}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45 }}
                                    className="flex gap-3 w-full"
                                >
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-medium flex items-center justify-center gap-2"
                                    >
                                        <X className="w-4 h-4" />
                                        {t('permissions.close')}
                                    </button>
                                    {redirectUrl ? (
                                        <button
                                            onClick={() => {
                                                setShowModal(false);
                                                router.push(redirectUrl);
                                            }}
                                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
                                        >
                                            <Shield className="w-4 h-4" />
                                            {t('permissions.goBack')}
                                        </button>
                                    ) : (
                                        <a
                                            href="mailto:admin@shakes.es?subject=Solicitud de acceso"
                                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25"
                                        >
                                            <Mail className="w-4 h-4" />
                                            {t('permissions.contactAdmin')}
                                        </a>
                                    )}
                                </motion.div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

export function usePermissionCheck() {
    const { user } = useAuth();
    const { t } = useTranslation();
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

    const PermissionDeniedModal = () => {
        const PermIcon = deniedPermission ? getPermissionIcon(deniedPermission) : Lock;
        const permColor = deniedPermission ? getPermissionColor(deniedPermission) : "#6b7280";
        const permLabel = deniedPermission ? (t(`permissions.labels.${deniedPermission}`) || deniedPermission) : "";

        return (
            <AnimatePresence>
                {deniedPermission && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                    >
                        <div 
                            className="absolute inset-0 bg-black/70 backdrop-blur-md"
                            onClick={clearDenied}
                        />
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0, y: 20 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            className="relative bg-gradient-to-br from-card via-card to-card/95 border border-border/50 rounded-3xl shadow-2xl max-w-lg w-full p-8 overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
                            
                            <button
                                onClick={clearDenied}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            
                            <div className="flex flex-col items-center text-center">
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring" }}
                                    className="relative mb-6"
                                >
                                    <div 
                                        className="w-24 h-24 rounded-3xl flex items-center justify-center"
                                        style={{ backgroundColor: `${permColor}15` }}
                                    >
                                        <PermIcon className="w-12 h-12" style={{ color: permColor }} />
                                    </div>
                                    <div 
                                        className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: permColor }}
                                    >
                                        <Lock className="w-4 h-4 text-white" />
                                    </div>
                                </motion.div>
                                
                                <motion.h2 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-2xl font-bold mb-2"
                                >
                                    {t('permissions.accessDenied')}
                                </motion.h2>
                                
                                <motion.p 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.35 }}
                                    className="text-muted-foreground mb-6"
                                >
                                    {t('permissions.youCannot')}
                                </motion.p>
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="w-full bg-gradient-to-r from-muted/50 to-muted/30 rounded-2xl p-4 mb-6 border border-border/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: `${permColor}20` }}
                                        >
                                            <AlertTriangle className="w-5 h-5" style={{ color: permColor }} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                                                {t('permissions.required')}
                                            </p>
                                            <p className="font-semibold" style={{ color: permColor }}>
                                                {permLabel}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                                
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45 }}
                                    onClick={clearDenied}
                                    className="w-full px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-medium flex items-center justify-center gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    {t('permissions.close')}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    };

    return { checkPermission, deniedPermission, clearDenied, PermissionDeniedModal };
}
