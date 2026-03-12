"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";

interface UserInfo {
    id: string;
    username: string;
    displayName: string;
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
                    "rounded-full flex items-center justify-center font-bold text-white cursor-pointer transition-transform hover:scale-110 shrink-0 ring-2 ring-background shadow-sm",
                    sizeClasses,
                    className
                )}
                style={{ backgroundColor: color }}
                title={`Último: ${user.displayName || user.username}`}
            >
                {letter}
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

    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
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

    return (
        <>
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[200]"
            />

            {/* Panel */}
            <motion.div
                initial={isMobile ? { y: "100%" } : { x: "100%" }}
                animate={isMobile ? { y: 0 } : { x: 0 }}
                exit={isMobile ? { y: "100%" } : { x: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className={cn(
                    "fixed z-[201] bg-sidebar border-border shadow-2xl overflow-hidden flex flex-col",
                    isMobile
                        ? "inset-x-0 bottom-0 rounded-t-3xl max-h-[70vh] border-t"
                        : "top-0 right-0 h-full w-96 border-l"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-sm"
                            style={{ backgroundColor: userColor(user.id) }}
                        >
                            {(user.displayName || user.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground">{user.displayName || user.username}</p>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Última modificación</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-xl transition-colors"
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
                                className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/30"
                            >
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px] shrink-0 mt-0.5"
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
}
