"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, BellOff, MessageSquare, Calendar, FileText, Users, Settings, Volume2, VolumeX, Clock, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";

type NotificationType = 'message' | 'calendar' | 'document' | 'system';

interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    actionUrl?: string;
    senderName?: string;
    conversationId?: string;
}

interface NotificationPanelProps {
    className?: string;
}

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
    message: <MessageSquare className="w-4 h-4" />,
    calendar: <Calendar className="w-4 h-4" />,
    document: <FileText className="w-4 h-4" />,
    system: <Settings className="w-4 h-4" />
};

const TYPE_COLORS: Record<NotificationType, string> = {
    message: "bg-blue-500",
    calendar: "bg-purple-500",
    document: "bg-amber-500",
    system: "bg-gray-500"
};

export function NotificationPanel({ className }: NotificationPanelProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useAuth();
    const { t } = useTranslation();
    const isOnChatPage = pathname === '/dashboard/chat';
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'all' | 'mentions' | 'dnd' | 'away'>('all');
    const [showSettings, setShowSettings] = useState(false);
    const [lastMessageIds, setLastMessageIds] = useState<Set<string>>(new Set());
    const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set());
    const [pollErrorCount, setPollErrorCount] = useState(0);
    const [isPollingPaused, setIsPollingPaused] = useState(false);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Load seen messages from localStorage on mount
    useEffect(() => {
        if (user?.id) {
            const stored = localStorage.getItem(`seen_messages_${user.id}`);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setSeenMessageIds(new Set(parsed));
                } catch (e) {
                    setSeenMessageIds(new Set());
                }
            }
        }
    }, [user?.id]);

    // Save seen messages to localStorage
    const saveSeenMessages = useCallback((ids: Set<string>) => {
        if (user?.id) {
            localStorage.setItem(`seen_messages_${user.id}`, JSON.stringify([...ids].slice(-100))); // Keep last 100
        }
    }, [user?.id]);

    // Mark a message as seen
    const markAsSeen = useCallback((messageId: string) => {
        setSeenMessageIds(prev => {
            const newSet = new Set(prev);
            newSet.add(messageId);
            saveSeenMessages(newSet);
            return newSet;
        });
        setNotifications(prev => prev.map(n => 
            n.id === messageId ? { ...n, read: true } : n
        ));
    }, [saveSeenMessages]);

    // Mark all as seen when opening modal
    const handleOpenModal = useCallback(() => {
        setIsOpen(true);
        // Mark all current notifications as seen
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        const allIds = notifications.map(n => n.id);
        if (allIds.length > 0) {
            setSeenMessageIds(prev => {
                const newSet = new Set(prev);
                allIds.forEach(id => newSet.add(id));
                saveSeenMessages(newSet);
                return newSet;
            });
        }
    }, [notifications, saveSeenMessages]);

    // Clear chat notifications when entering chat page
    useEffect(() => {
        if (isOnChatPage) {
            // Mark all message notifications as seen when entering chat
            setNotifications(prev => {
                const messageIds = prev.filter(n => n.type === 'message').map(n => n.id);
                if (messageIds.length > 0) {
                    setSeenMessageIds(prevSet => {
                        const newSet = new Set(prevSet);
                        messageIds.forEach(id => newSet.add(id));
                        saveSeenMessages(newSet);
                        return newSet;
                    });
                }
                return prev.filter(n => n.type !== 'message');
            });
        }
    }, [isOnChatPage, saveSeenMessages]);

    const fetchNewMessages = useCallback(async () => {
        if (mode === 'dnd' || mode === 'away' || !user || isOnChatPage || isPollingPaused) return;
        
        try {
            const res = await axios.get(API_ENDPOINTS.CHAT.CONVERSATIONS, { 
                withCredentials: true 
            });
            
            const conversations = res.data || [];
            const newMessageIds: string[] = [];
            const newNotifications: Notification[] = [];
            
            for (const conv of conversations) {
                if (conv.lastMessage) {
                    const msgId = conv.lastMessage.id;
                    
                    // Skip if already notified, already seen, or from current user
                    if (lastMessageIds.has(msgId) || seenMessageIds.has(msgId) || conv.lastMessage.senderId === user.id) {
                        continue;
                    }
                    
                    const senderName = conv.lastMessage.sender?.displayName || conv.lastMessage.sender?.username || 'Someone';
                    newNotifications.push({
                        id: msgId,
                        type: 'message',
                        title: senderName,
                        message: conv.lastMessage.content,
                        timestamp: new Date(conv.lastMessage.createdAt),
                        read: false,
                        actionUrl: '/dashboard/chat',
                        senderName,
                        conversationId: conv.id
                    });
                    newMessageIds.push(msgId);
                }
            }
            
            if (newNotifications.length > 0) {
                setLastMessageIds(prev => new Set([...prev, ...newMessageIds]));
                setNotifications(prev => [...newNotifications, ...prev].slice(0, 4));
            }
            
            setPollErrorCount(0);
        } catch (err: any) {
            if (err?.response?.status === 429) {
                setPollErrorCount(prev => prev + 1);
                if (pollErrorCount >= 2) {
                    setIsPollingPaused(true);
                    setTimeout(() => setIsPollingPaused(false), 15000);
                }
            }
        }
    }, [mode, lastMessageIds, seenMessageIds, user, isOnChatPage, isPollingPaused, pollErrorCount]);

    // Smart polling - 5s base, 15s when paused
    useEffect(() => {
        const interval = setInterval(fetchNewMessages, isPollingPaused ? 15000 : 5000);
        return () => clearInterval(interval);
    }, [fetchNewMessages, isPollingPaused]);

    const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        if (mode === 'dnd') return;
        if (mode === 'away') return;
        
        const newNotification: Notification = {
            ...notification,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            read: false
        };
        
        setNotifications(prev => [newNotification, ...prev].slice(0, 4));
    }, [mode]);

    const markAsRead = (id: string) => {
        setNotifications(prev => 
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
    };

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const clearAll = () => {
        setNotifications([]);
    };

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        
        if (minutes < 1) return "Ahora";
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        return date.toLocaleDateString();
    };

    return (
        <div className={cn("fixed bottom-4 right-4 z-[9999]", className)}>
            {/* Toggle button */}
            <button
                onClick={isOpen ? () => setIsOpen(false) : handleOpenModal}
                className={cn(
                    "relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg",
                    "bg-background border border-border hover:bg-muted",
                    unreadCount > 0 && "ring-2 ring-primary/50 animate-pulse"
                )}
            >
                {mode === 'dnd' ? (
                    <BellOff className="w-5 h-5 text-muted-foreground" />
                ) : mode === 'away' ? (
                    <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                    <Bell className="w-5 h-5" />
                )}
                {unreadCount > 0 && mode !== 'dnd' && mode !== 'away' && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                            "absolute bottom-16 right-0 w-80 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden",
                            "max-h-[500px] flex flex-col"
                        )}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-gradient-to-r from-background to-muted/10">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Bell className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm">{t('notifications.title')}</h3>
                                    {unreadCount > 0 && (
                                        <p className="text-xs text-muted-foreground">{unreadCount} {t('notifications.unreadCount')}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 focus:ring-2 focus:ring-primary/30"
                                    title={t('common.settings')}
                                >
                                    <Settings className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 focus:ring-2 focus:ring-primary/30"
                                    title={t('common.close')}
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        </div>

                        {/* Settings */}
                        {showSettings && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="p-4 border-b border-border/50 bg-muted/20"
                            >
                                <p className="text-xs text-muted-foreground mb-3 font-medium">{t('notifications.title')}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setMode('all')}
                                        className={cn(
                                            "p-3 rounded-xl text-xs text-center transition-all duration-200 focus:ring-2 focus:ring-primary/30",
                                            "flex flex-col items-center gap-1",
                                            mode === 'all' ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/50 hover:bg-muted active:scale-95"
                                        )}
                                    >
                                        <Bell className="w-4 h-4" />
                                        <span>{t('notifications.mode.all')}</span>
                                    </button>
                                    <button
                                        onClick={() => setMode('mentions')}
                                        className={cn(
                                            "p-3 rounded-xl text-xs text-center transition-all duration-200 focus:ring-2 focus:ring-primary/30",
                                            "flex flex-col items-center gap-1",
                                            mode === 'mentions' ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/50 hover:bg-muted active:scale-95"
                                        )}
                                    >
                                        <Users className="w-4 h-4" />
                                        <span>{t('notifications.mode.mentions')}</span>
                                    </button>
                                    <button
                                        onClick={() => setMode('dnd')}
                                        className={cn(
                                            "p-3 rounded-xl text-xs text-center transition-all duration-200 focus:ring-2 focus:ring-primary/30",
                                            "flex flex-col items-center gap-1",
                                            mode === 'dnd' ? "bg-red-500 text-white shadow-md" : "bg-muted/50 hover:bg-muted active:scale-95"
                                        )}
                                    >
                                        <BellOff className="w-4 h-4" />
                                        <span>{t('notifications.mode.dnd')}</span>
                                    </button>
                                    <button
                                        onClick={() => setMode('away')}
                                        className={cn(
                                            "p-3 rounded-xl text-xs text-center transition-all duration-200 focus:ring-2 focus:ring-primary/30",
                                            "flex flex-col items-center gap-1",
                                            mode === 'away' ? "bg-yellow-500 text-white shadow-md" : "bg-muted/50 hover:bg-muted active:scale-95"
                                        )}
                                    >
                                        <Moon className="w-4 h-4" />
                                        <span>{t('notifications.mode.away')}</span>
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Notifications list */}
                        <div className="flex-1 overflow-y-auto max-h-80 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                                        <Bell className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">{t('notifications.empty.title')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('notifications.empty.subtitle')}</p>
                                </div>
                            ) : (
                                notifications.map(notification => (
                                    <div
                                        key={notification.id}
                                        className={cn(
                                            "p-4 border-b border-border/30 hover:bg-muted/30 transition-all duration-200 cursor-pointer group",
                                            !notification.read && "bg-primary/5 border-l-2 border-l-primary"
                                        )}
                                        onClick={() => markAsRead(notification.id)}
                                    >
                                        <div className="flex gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm",
                                                TYPE_COLORS[notification.type]
                                            )}>
                                                {TYPE_ICONS[notification.type]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-medium text-sm truncate">{notification.title}</p>
                                                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                                        {formatTime(notification.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">{notification.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="p-3 border-t border-border/50 flex justify-between bg-muted/10">
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-primary hover:underline font-medium transition-all"
                                >
                                    {t('common.markAllRead')}
                                </button>
                                <button
                                    onClick={clearAll}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-all"
                                >
                                    {t('common.clearAll')}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast notifications */}
            <div className="fixed bottom-16 right-4 space-y-2 z-[9998]">
                <AnimatePresence>
                    {notifications.filter(n => !n.read).slice(0, 3).map(notification => (
                        <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, x: 50, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 50, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                                "w-72 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-lg p-4 cursor-pointer",
                                "hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
                            )}
                            onClick={() => {
                                markAsRead(notification.id);
                                router.push('/dashboard/chat');
                            }}
                        >
                            <div className="flex gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm",
                                    TYPE_COLORS[notification.type]
                                )}>
                                    {TYPE_ICONS[notification.type]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{notification.title}</p>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{notification.message}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
