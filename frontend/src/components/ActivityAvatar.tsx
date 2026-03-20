"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";

interface UserInfo {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
}

interface ActivityEntry {
    id: string;
    type: string;
    action: string;
    resourceName?: string;
    owner: UserInfo;
    createdAt: string;
}

interface ActivityAvatarProps {
    user?: UserInfo | null;
    resourceId?: string;
    resourceType?: string;
    size?: "sm" | "md";
    className?: string;
}

// Deterministic color from user ID
function userColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 55%)`;
}

export function ActivityAvatar({ user, resourceId, resourceType, size = "sm", className }: ActivityAvatarProps) {
    const [showPanel, setShowPanel] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    if (!user) return null;

    const letter = (user.displayName || user.username || "?").charAt(0).toUpperCase();
    const color = userColor(user.id);
    const sizeClasses = size === "sm" ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-xs";

    return (
        <>
            <div
                ref={ref}
                onClick={(e) => { e.stopPropagation(); setShowPanel(true); }}
                className={cn(
                    "rounded-full flex items-center justify-center font-bold text-white cursor-pointer transition-transform hover:scale-110 shrink-0 ring-2 ring-background shadow-sm overflow-hidden",
                    sizeClasses,
                    className
                )}
                style={{ backgroundColor: color }}
                title={`Último: ${user.displayName || user.username}`}
            >
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName || user.username} className="w-full h-full object-cover" />
                ) : (
                    letter
                )}
            </div>

            <AnimatePresence>
                {showPanel && (
                    <ActivityHistoryPanel
                        user={user}
                        resourceId={resourceId}
                        resourceType={resourceType}
                        onClose={() => setShowPanel(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

interface ActivityHistoryPanelProps {
    user: UserInfo;
    resourceId?: string;
    resourceType?: string;
    onClose: () => void;
}

function ActivityHistoryPanel({ user, resourceId, resourceType, onClose }: ActivityHistoryPanelProps) {
    const [history, setHistory] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsMobile(window.innerWidth < 768);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                if (resourceId && resourceType) {
                    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
                    const res = await axios.get(`${API}/api/activity`, {
                        params: { resourceId, resourceType, limit: 20 },
                        withCredentials: true,
                    });
                    setHistory(res.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch activity history:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [resourceId, resourceType]);

    // Prevent body scroll when panel open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    if (!mounted) return null;

    const content = (
        <>
            {/* Full-screen dark overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                className="bg-black/50 backdrop-blur-sm"
            />

            {/* Modal panel */}
            <motion.div
                initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
                exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                transition={isMobile
                    ? { type: "spring", stiffness: 400, damping: 35 }
                    : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                }
                style={{ zIndex: 99999 }}
                className={cn(
                    "fixed bg-sidebar shadow-2xl overflow-hidden flex flex-col border border-border/60",
                    isMobile
                        ? "inset-x-0 bottom-0 rounded-t-3xl max-h-[80vh]"
                        : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-3xl max-h-[70vh]"
                )}
            >
                {/* Drag handle on mobile */}
                {isMobile && (
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md"
                            style={{ backgroundColor: userColor(user.id) }}
                        >
                            {(user.displayName || user.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground">{user.displayName || user.username}</p>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Historial de actividad</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 hover:bg-muted rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* History List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-10">
                            <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                            <p className="text-sm text-muted-foreground font-medium">Sin historial de actividad</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Las acciones aparecerán aquí</p>
                        </div>
                    ) : (
                        history.map((entry) => (
                            <div
                                key={entry.id}
                                className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 transition-colors hover:bg-muted/30"
                            >
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px] shrink-0 mt-0.5 shadow-sm"
                                    style={{ backgroundColor: userColor(entry.owner.id) }}
                                >
                                    {(entry.owner.displayName || entry.owner.username || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-foreground">
                                        {entry.owner.displayName || entry.owner.username}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground truncate">{entry.action}</p>
                                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                        {new Date(entry.createdAt).toLocaleString("es-ES", {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </>
    );

    return createPortal(content, document.body);
}

