"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { PreviewModal } from "@/components/PreviewModal";
import { cn } from "@/lib/utils";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermission } from "@/hooks/usePermission";
import { motion, AnimatePresence } from "framer-motion";
import {
    Check,
    ChevronLeft,
    FileText,
    Folder,
    MessageSquare,
    MoreVertical,
    Plus,
    Search,
    Send,
    Trash2,
    X,
    Menu,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

interface User {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    status: string;
    roles?: string[];
}

interface Message {
    id: string;
    content: string;
    type: string;
    createdAt: string;
    senderId: string;
    sender: {
        id: string;
        username: string;
        displayName: string;
        avatar?: string;
    };
    reactions?: Array<{
        emoji: string;
        user: { id: string; displayName: string };
    }>;
    metadata?: {
        mentions?: Array<{
            type: 'user' | 'file' | 'folder';
            id: string;
            name: string;
        }>;
    };
}

interface Conversation {
    id: string;
    name: string | null;
    isGroup: boolean;
    participants: Array<{
        role: string;
        user: User;
    }>;
    lastMessage: Message | null;
    unreadCount: number;
}

const STATUS_COLORS: Record<string, string> = {
    online: "bg-green-500",
    away: "bg-yellow-500",
    dnd: "bg-red-500",
    offline: "bg-gray-400"
};

const STATUS_LABELS: Record<string, string> = {
    online: "En línea",
    away: "Ausente",
    dnd: "No molestar",
    offline: "Desconectado"
};

export default function ChatPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { canViewChat, canSendMessages, canCreateChats, canDeleteMessages, canEditMessages, canCreateGroupChats, canSendAttachments, canDeleteConversations } = usePermission();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [usersLoading, setUsersLoading] = useState(false);
    const [showNewChat, setShowNewChat] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [userStatus, setUserStatus] = useState<string>("online");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isFirstLoadRef = useRef(true);
    const prevMessagesLengthRef = useRef(0);
    const [panel, setPanel] = useState<"list" | "chat">("list");
    const [showConversationMenu, setShowConversationMenu] = useState(false);
    const [messageMenuOpen, setMessageMenuOpen] = useState<string | null>(null);
    const [pollErrorCount, setPollErrorCount] = useState(0);
    const [isPollingPaused, setIsPollingPaused] = useState(false);
    
    // @mentions state
    const [mentionQuery, setMentionQuery] = useState("");
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionResults, setMentionResults] = useState<Array<{type: 'user' | 'file' | 'folder'; id: string; name: string; path?: string; canShare: boolean}>>([]);
    const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Track which files the current user can access
    const [accessibleFileIds, setAccessibleFileIds] = useState<Set<string>>(new Set());
    const [accessibleFolderIds, setAccessibleFolderIds] = useState<Set<string>>(new Set());
    
    // File preview modal
    const [previewFile, setPreviewFile] = useState<{id: string; name: string; mimeType: string} | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const fetchConversations = async (silent = false) => {
        if (isPollingPaused) return;
        try {
            const res = await axios.get(API_ENDPOINTS.CHAT.CONVERSATIONS, { withCredentials: true });
            const convData = res.data?.data || res.data;
            setConversations(Array.isArray(convData) ? convData : []);
            setPollErrorCount(0); // Reset on success
        } catch (err: any) {
            if (err?.response?.status === 429) {
                // Rate limit - pause polling and retry later
                setPollErrorCount(prev => prev + 1);
                if (pollErrorCount >= 2) {
                    setIsPollingPaused(true);
                    setTimeout(() => setIsPollingPaused(false), 10000); // Pause 10s
                }
            }
            if (!silent) console.error("Failed to fetch conversations:", err);
        }
    };

    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const res = await axios.get(API_ENDPOINTS.CHAT.USERS, { withCredentials: true });
            const usersData = res.data?.data || res.data;
            setUsers(Array.isArray(usersData) ? usersData : []);
        } catch (err) {
            console.error("Failed to fetch users:", err);
            setUsers([]);
        } finally {
            setUsersLoading(false);
        }
    };

    const fetchMessages = async (conversationId: string, silent = false) => {
        if (isPollingPaused) return;
        try {
            const res = await axios.get(API_ENDPOINTS.CHAT.CONVERSATION_MESSAGES(conversationId), { 
                withCredentials: true 
            });
            setMessages(res.data);
            setPollErrorCount(0);
        } catch (err: any) {
            if (err?.response?.status === 429) {
                setPollErrorCount(prev => prev + 1);
                if (pollErrorCount >= 2) {
                    setIsPollingPaused(true);
                    setTimeout(() => setIsPollingPaused(false), 10000);
                }
            }
            if (!silent) console.error("Failed to fetch messages:", err);
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !activeConversation || !canSendMessages()) return;
        
        try {
            await axios.post(
                API_ENDPOINTS.CHAT.CONVERSATION_MESSAGES(activeConversation.id),
                { content: newMessage },
                { withCredentials: true }
            );
            setNewMessage("");
            setShowMentionDropdown(false);
            fetchMessages(activeConversation.id);
            fetchConversations();
        } catch (err) {
            console.error("Failed to send message:", err);
        }
    };

    // Search for @mentions (users, files, folders)
    const searchMentions = async (query: string) => {
        if (!query.trim()) {
            setMentionResults([]);
            return;
        }
        
        try {
            const res = await axios.get(
                `${API_ENDPOINTS.CHAT.SEARCH_MENTIONS}?query=${encodeURIComponent(query)}`,
                { withCredentials: true }
            );
            setMentionResults(res.data);
        } catch (err) {
            console.error("Failed to search mentions:", err);
        }
    };

    // Handle input change for @mentions
    const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setNewMessage(value);
        
        // Detect @ mention trigger
        const cursorPos = e.target.selectionStart || 0;
        const textBeforeCursor = value.slice(0, cursorPos);
        const mentionMatch = textBeforeCursor.match(/@([^@]*)$/);
        
        if (mentionMatch) {
            const query = mentionMatch[1];
            setMentionQuery(query);
            setShowMentionDropdown(true);
            searchMentions(query);
            
            // Calculate position for dropdown
            if (inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect();
                setMentionPosition({ top: rect.top - 200, left: rect.left });
            }
        } else {
            setShowMentionDropdown(false);
            setMentionQuery("");
        }
    };

    // Insert mention into message
    const insertMention = (item: {type: 'user' | 'file' | 'folder'; id: string; name: string}) => {
        const cursorPos = inputRef.current?.selectionStart || 0;
        const textBeforeCursor = newMessage.slice(0, cursorPos);
        const textAfterCursor = newMessage.slice(cursorPos);
        
        // Replace @query with @[type:id:name]
        const mentionText = `@[${item.type}:${item.id}:${item.name}]`;
        const newText = textBeforeCursor.replace(/@[^@]*$/, mentionText) + textAfterCursor;
        
        setNewMessage(newText);
        setShowMentionDropdown(false);
        setMentionQuery("");
        
        // Focus input
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const createConversation = async (userId: string) => {
        if (!canCreateChats()) return;
        try {
            const res = await axios.post(
                API_ENDPOINTS.CHAT.CONVERSATIONS,
                { participantIds: [userId] },
                { withCredentials: true }
            );
            await fetchConversations();
            setActiveConversation(res.data);
            setShowNewChat(false);
        } catch (err: any) {
            // If conversation already exists (409), use existing one
            if (err.response?.status === 409 && err.response?.data?.conversation) {
                const existingConv = err.response.data.conversation;
                await fetchConversations();
                setActiveConversation(existingConv);
                setShowNewChat(false);
            } else {
                console.error("Failed to create conversation:", err);
            }
        }
    };

    const deleteConversation = async (conversationId: string) => {
        if (!canDeleteConversations()) return;
        try {
            await axios.delete(`${API_ENDPOINTS.CHAT.CONVERSATIONS}/${conversationId}`, {
                withCredentials: true
            });
            setConversations(prev => prev.filter(c => c.id !== conversationId));
            if (activeConversation?.id === conversationId) {
                setActiveConversation(null);
            }
            setShowConversationMenu(false);
        } catch (err) {
            console.error("Failed to delete conversation:", err);
        }
    };

    // Fetch accessible files for the current user (to check permissions)
    const fetchAccessibleFiles = async () => {
        try {
            const res = await axios.get(`${API_ENDPOINTS.CHAT.SEARCH_MENTIONS}?type=file`, { withCredentials: true });
            const files = res.data.filter((item: any) => item.type === 'file');
            const folders = res.data.filter((item: any) => item.type === 'folder');
            setAccessibleFileIds(new Set(files.map((f: any) => f.id)));
            setAccessibleFolderIds(new Set(folders.map((f: any) => f.id)));
        } catch (err) {
            console.error("Failed to fetch accessible files:", err);
        }
    };

    // Parse message content and render mentions
    const renderMessageContent = (content: string, metadata?: Message['metadata']) => {
        const mentionRegex = /@\[(user|file|folder):([a-zA-Z0-9-]+):([^\]]+)\]/g;
        const parts: Array<{ type: 'text' | 'mention'; text?: string; mentionType?: string; id?: string; name?: string }> = [];
        let lastIndex = 0;
        let match;

        while ((match = mentionRegex.exec(content)) !== null) {
            // Add text before the mention
            if (match.index > lastIndex) {
                parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
            }

            const [, mentionType, id, name] = match;
            parts.push({ type: 'mention', mentionType, id, name });
            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < content.length) {
            parts.push({ type: 'text', text: content.slice(lastIndex) });
        }

        return parts.map((part, idx) => {
            if (part.type === 'text') {
                return <span key={idx}>{part.text}</span>;
            }

            const hasAccess = part.mentionType === 'user' || 
                (part.mentionType === 'file' && accessibleFileIds.has(part.id!)) ||
                (part.mentionType === 'folder' && accessibleFolderIds.has(part.id!));

            const isFile = part.mentionType === 'file';
            const isImage = isFile && /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(part.name || '');

            const handleClick = async () => {
                if (!hasAccess || !isFile) return;
                
                if (part.mentionType === 'file') {
                    setPreviewFile({ id: part.id!, name: part.name!, mimeType: '' });
                    setPreviewLoading(true);
                    
                    try {
                        const res = await axios.get(`${API_ENDPOINTS.FILES.BASE}/${part.id}`, { withCredentials: true });
                        const file = res.data;
                        setPreviewFile({ id: file.id, name: file.originalName, mimeType: file.mimeType });
                        
                        const previewRes = await axios.get(`${API_ENDPOINTS.FILES.BASE}/${file.id}/preview`, { withCredentials: true });
                        setPreviewUrl(previewRes.data.url);
                    } catch (err) {
                        console.error("Failed to get file preview:", err);
                    } finally {
                        setPreviewLoading(false);
                    }
                }
            };

            if (isFile) {
                return (
                    <span key={idx} className="block my-2">
                        <div
                            onClick={hasAccess ? handleClick : undefined}
                            className={cn(
                                "relative rounded-2xl overflow-hidden border transition-all duration-200",
                                hasAccess 
                                    ? "cursor-pointer hover:shadow-lg hover:scale-[1.02] bg-background border-border/60"
                                    : "cursor-not-allowed bg-muted/30 border-border/30 opacity-60"
                            )}
                        >
                            <div className="flex items-center gap-3 p-3 min-w-[200px]">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                    hasAccess ? "bg-blue-100" : "bg-gray-100"
                                )}>
                                    <FileText className={cn("w-6 h-6", hasAccess ? "text-blue-600" : "text-gray-400")} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={cn("text-sm font-medium truncate", hasAccess ? "text-foreground" : "text-muted-foreground")}>
                                        {part.name}
                                    </p>
                                    {!hasAccess && (
                                        <p className="text-xs text-muted-foreground">Sin acceso</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </span>
                );
            }

            return (
                <span key={idx} className="mx-0.5">
                    <span
                        onClick={part.mentionType === 'folder' ? () => { window.location.href = `/dashboard/files?folderId=${part.id}`; } : undefined}
                        className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200",
                            part.mentionType === 'folder'
                                ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 hover:scale-105 hover:shadow-md hover:shadow-green-200/50"
                                : "bg-primary/10 text-primary border border-primary/20 hover:scale-105"
                        )}
                    >
                        {part.mentionType === 'folder' ? (
                            <Folder className="w-3 h-3" />
                        ) : (
                            <span className="w-3 h-3 rounded-full bg-primary/20 flex items-center justify-center text-[8px]">@</span>
                        )}
                        {part.name}
                    </span>
                </span>
            );
        });
    };

    const deleteMessage = async (messageId: string) => {
        if (!canDeleteMessages()) return;
        try {
            await axios.delete(API_ENDPOINTS.CHAT.MESSAGE(messageId), {
                withCredentials: true
            });
            setMessages(prev => prev.filter(m => m.id !== messageId));
            setMessageMenuOpen(null);
        } catch (err) {
            console.error("Failed to delete message:", err);
        }
    };

    const updateStatus = async (status: string) => {
        try {
            await axios.put(
                API_ENDPOINTS.CHAT.STATUS,
                { status },
                { withCredentials: true }
            );
            setUserStatus(status);
        } catch (err) {
            console.error("Failed to update status:", err);
        }
    };

    useEffect(() => {
        if (user && user.permissions?.includes('view_chat')) {
            fetchConversations();
            fetchUsers();
            fetchAccessibleFiles();
        }
    }, [user]);

    // Smart polling for conversations - 5s base, pauses on rate limit
    useEffect(() => {
        if (!user || !user.permissions?.includes('view_chat')) return;
        
        const interval = setInterval(() => {
            fetchConversations(true);
        }, isPollingPaused ? 10000 : 5000); // 10s when paused, 5s normal
        
        return () => clearInterval(interval);
    }, [user, isPollingPaused]);

    useEffect(() => {
        if (activeConversation) {
            isFirstLoadRef.current = true;
            prevMessagesLengthRef.current = 0;
            fetchMessages(activeConversation.id);
            setPanel("chat");
        }
    }, [activeConversation]);

    // Smart polling for messages - 3s base, pauses on rate limit
    useEffect(() => {
        if (!activeConversation) return;
        
        const interval = setInterval(() => {
            fetchMessages(activeConversation.id, true);
        }, isPollingPaused ? 10000 : 3000); // 10s when paused, 3s normal
        
        return () => clearInterval(interval);
    }, [activeConversation, isPollingPaused]);

    // Only scroll to bottom on first load or when new messages arrive and user is at bottom
    useEffect(() => {
        if (messages.length === 0) return;
        
        const container = messagesEndRef.current?.parentElement;
        if (!container) return;
        
        // Only scroll on first load of conversation
        if (isFirstLoadRef.current) {
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
            isFirstLoadRef.current = false;
        } else {
            // Check if new messages arrived AND user is at bottom
            const hasNewMessages = messages.length > prevMessagesLengthRef.current;
            const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
            
            if (hasNewMessages && isAtBottom) {
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 50);
            }
        }
        
        prevMessagesLengthRef.current = messages.length;
    }, [messages]);

    const getConversationName = (conv: Conversation) => {
        if (conv.name) return conv.name;
        const other = conv.participants.find(p => p.user.id !== user?.id);
        return other?.user.displayName || other?.user.username || "Chat";
    };

    const getConversationAvatar = (conv: Conversation) => {
        const other = conv.participants.find(p => p.user.id !== user?.id);
        return other?.user;
    };

    const formatMessageTime = (date: string) => {
        const d = new Date(date);
        if (isToday(d)) return format(d, "HH:mm");
        if (isYesterday(d)) return "Ayer";
        return format(d, "d MMM", { locale: es });
    };

    const filteredConversations = conversations.filter(c => 
        getConversationName(c).toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredUsers = users.filter(u => 
        u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!canViewChat()) {
        return (
            <PermissionGuard permission="view_chat" redirectUrl="/dashboard/home">
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                        <h2 className="text-xl font-semibold">Sin acceso al chat</h2>
                        <p className="text-muted-foreground mt-2">No tienes permisos para usar el chat</p>
                    </div>
                </div>
            </PermissionGuard>
        );
    }

    return (
        <div className="h-dvh min-h-0">
            <div className="grid h-dvh min-h-0 grid-cols-1 md:grid-cols-[360px_1fr]">
                {/* Left: Conversations */}
                <aside className={cn("min-h-0 border-r border-border bg-sidebar", panel === "chat" ? "hidden md:block" : "block")}>
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="sticky top-0 z-10 border-b border-border bg-sidebar/90 backdrop-blur">
                            <div className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex items-center gap-2">
                                        <button
                                            onClick={() => window.dispatchEvent(new CustomEvent('openMobileMenu'))}
                                            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
                                            aria-label="Menu"
                                        >
                                            <Menu className="h-4 w-4" />
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="h-5 w-5 text-primary" />
                                                <h1 className="truncate text-sm font-semibold">{t("chat.title")}</h1>
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {t("chat.status.online")}: <span className="font-medium text-foreground">{STATUS_LABELS[userStatus] || userStatus}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => canCreateChats() && setShowNewChat(true)}
                                        disabled={!canCreateChats()}
                                        title={canCreateChats() ? t("chat.newChat") : t("chat.noPermission")}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                    <div className="flex-1 rounded-xl border border-border bg-background px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <Search className="h-4 w-4 text-muted-foreground" />
                                            <input
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder={t("chat.searchConversations")}
                                                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                                            />
                                        </div>
                                    </div>
                                    <select
                                        value={userStatus}
                                        onChange={(e) => updateStatus(e.target.value)}
                                        className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                                        aria-label="Status"
                                    >
                                        <option value="online">{t("chat.status.online")}</option>
                                        <option value="away">{t("chat.status.away")}</option>
                                        <option value="dnd">{t("chat.status.dnd")}</option>
                                        <option value="offline">{t("chat.status.offline")}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto">
                            {filteredConversations.length === 0 ? (
                                <div className="p-6 text-center text-sm text-muted-foreground">
                                    <div className="mx-auto mb-2 w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center border border-border">
                                        <MessageSquare className="h-5 w-5 opacity-50" />
                                    </div>
                                    <div className="font-medium">{t("chat.noConversations")}</div>
                                    <div className="mt-1 text-xs">{t("chat.startConversation")}</div>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {filteredConversations.map((conv) => {
                                        const isActive = activeConversation?.id === conv.id;
                                        const avatar = getConversationAvatar(conv);
                                        return (
                                            <button
                                                key={conv.id}
                                                onClick={() => setActiveConversation(conv)}
                                                className={cn(
                                                    "w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors",
                                                    isActive && "bg-muted/50"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="relative h-10 w-10 shrink-0 rounded-xl border border-border bg-background flex items-center justify-center">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            {avatar?.displayName?.[0] || avatar?.username?.[0] || "?"}
                                                        </span>
                                                        {avatar && (
                                                            <span className={cn(
                                                                "absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-sidebar",
                                                                STATUS_COLORS[avatar.status] || STATUS_COLORS.offline
                                                            )} />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="truncate text-sm font-semibold text-foreground">
                                                                {getConversationName(conv)}
                                                            </div>
                                                            {conv.lastMessage && (
                                                                <div className="text-[10px] font-medium text-muted-foreground">
                                                                    {formatMessageTime(conv.lastMessage.createdAt)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                            {conv.lastMessage ? (
                                                                <>
                                                                    {conv.lastMessage.senderId === user?.id ? t("chat.messages.you") : ""}
                                                                    {conv.lastMessage.content}
                                                                </>
                                                            ) : (
                                                                t("chat.messages.noMessages")
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* Right: Messages */}
                <section className={cn("min-h-0 bg-background", panel === "list" ? "hidden md:block" : "block")}>
                    {!activeConversation ? (
                        <div className="flex h-full min-h-0 items-center justify-center p-8">
                            <div className="text-center text-muted-foreground">
                                <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center border border-border">
                                    <MessageSquare className="h-6 w-6 opacity-50" />
                                </div>
                                <div className="text-sm font-semibold text-foreground">{t("chat.noConversations")}</div>
                                <div className="mt-1 text-xs">{t("chat.startConversation")}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 flex-col">
                            {/* Header */}
                            <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
                                <div className="flex items-center justify-between gap-3 px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <button
                                            onClick={() => { setPanel("list"); setActiveConversation(null); }}
                                            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
                                            aria-label="Back"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => window.dispatchEvent(new CustomEvent('openMobileMenu'))}
                                            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
                                            aria-label="Menu"
                                        >
                                            <Menu className="h-5 w-5" />
                                        </button>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold">{getConversationName(activeConversation)}</div>
                                            <div className="text-[11px] text-muted-foreground">
                                                {activeConversation.isGroup
                                                    ? `${activeConversation.participants.length} ${t("chat.header.members")}`
                                                    : t("chat.header.online")}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <button
                                            onClick={() => setShowConversationMenu(!showConversationMenu)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted"
                                            aria-label="Menu"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                        {showConversationMenu && (
                                            <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                                                {canDeleteConversations() && (
                                                    <button
                                                        onClick={() => deleteConversation(activeConversation.id)}
                                                        className="w-full px-4 py-3 text-left text-sm hover:bg-muted flex items-center gap-2 text-red-600"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        {t("chat.menu.deleteChat")}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                            {messages.map((msg, idx) => {
                                const isOwn = msg.senderId === user?.id;
                                const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
                                
                                return (
                                    <div
                                        key={msg.id}
                                        className={cn("flex gap-3 group", isOwn && "flex-row-reverse")}
                                    >
                                        {showAvatar ? (
                                            <div className="w-9 h-9 rounded-xl border border-border bg-muted/30 flex items-center justify-center flex-shrink-0">
                                                <span className="text-sm font-semibold text-foreground">
                                                    {msg.sender.displayName?.[0] || msg.sender.username[0]}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="w-9" />
                                        )}
                                        <div className={cn("max-w-[75%] relative", isOwn && "text-right")}>
                                            {showAvatar && (
                                                <p className="text-[11px] text-muted-foreground mb-1">
                                                    {msg.sender.displayName || msg.sender.username}
                                                </p>
                                            )}
                                            <div className="flex items-end gap-1">
                                                <div className={cn(
                                                    "inline-block px-3 py-2 rounded-2xl border transition-colors",
                                                    isOwn 
                                                        ? "bg-foreground text-background border-foreground rounded-br-md"
                                                        : "bg-background text-foreground border-border rounded-bl-md"
                                                )}>
                                                    <p className="text-sm leading-relaxed">{renderMessageContent(msg.content, msg.metadata)}</p>
                                                </div>
                                                
                                                {/* 3-dot menu for message */}
                                                <div className="relative opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                    <button
                                                        onClick={() => setMessageMenuOpen(messageMenuOpen === msg.id ? null : msg.id)}
                                                        className="p-1.5 rounded-lg hover:bg-muted/50 transition-all duration-200 focus:ring-2 focus:ring-primary/30"
                                                    >
                                                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                                    </button>
                                                    
                                                    {messageMenuOpen === msg.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            transition={{ duration: 0.15 }}
                                                            className={cn(
                                                                "absolute top-full mt-1 w-36 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden",
                                                                isOwn ? "right-0" : "left-0"
                                                            )}
                                                        >
                                                            {(isOwn || canDeleteMessages()) && (
                                                                <button
                                                                    onClick={() => deleteMessage(msg.id)}
                                                                    className="w-full px-3 py-3 text-left text-sm hover:bg-muted flex items-center gap-2 text-red-600 transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                    Eliminar
                                                                </button>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                {format(new Date(msg.createdAt), "HH:mm")}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                            </div>

                            {/* Composer */}
                            <div className="border-t border-border bg-background p-4">
                                <div className="relative flex items-center gap-3">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={newMessage}
                                    onChange={handleMessageChange}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !showMentionDropdown && canSendMessages()) {
                                            sendMessage();
                                        } else if (e.key === "Escape") {
                                            setShowMentionDropdown(false);
                                        }
                                    }}
                                    placeholder={canSendMessages() ? t('chat.input.placeholder') : t('chat.noPermission')}
                                    disabled={!canSendMessages()}
                                    className="flex-1 h-11 rounded-2xl border border-border bg-muted/30 px-4 text-sm outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                
                                {/* @mentions dropdown */}
                                {showMentionDropdown && mentionResults.length > 0 && (
                                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto z-50">
                                        {mentionResults.map((item) => (
                                            <button
                                                key={`${item.type}-${item.id}`}
                                                onClick={() => insertMention(item)}
                                                className="w-full px-4 py-3 text-left hover:bg-muted flex items-center gap-3 transition-colors"
                                            >
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                                    item.type === 'user' ? "bg-primary/10" : 
                                                    item.type === 'file' ? "bg-blue-100" : "bg-green-100"
                                                )}>
                                                    {item.type === 'user' ? (
                                                        <span className="text-xs font-bold text-primary">
                                                            {item.name[0].toUpperCase()}
                                                        </span>
                                                    ) : item.type === 'file' ? (
                                                        <FileText className="w-4 h-4 text-blue-600" />
                                                    ) : (
                                                        <Folder className="w-4 h-4 text-green-600" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                                                </div>
                                                {!item.canShare && item.type !== 'user' && (
                                                    <span className="text-xs text-amber-500">Sin compartir</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={sendMessage}
                                    disabled={!newMessage.trim() || !canSendMessages()}
                                    title={canSendMessages() ? t('chat.input.send') : t('chat.noPermission')}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* New chat modal */}
            <AnimatePresence>
                {showNewChat && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => setShowNewChat(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-background rounded-xl w-full max-w-md p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold">{t('chat.newChatModal.title')}</h2>
                                <button 
                                    onClick={() => setShowNewChat(false)}
                                    className="p-1 hover:bg-muted rounded"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <input
                                type="text"
                                placeholder={t('chat.newChatModal.searchUsers')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 bg-muted rounded-lg text-sm outline-none mb-4"
                            />

                            <div className="max-h-64 overflow-y-auto space-y-2">
                                {usersLoading ? (
                                    <p className="text-center text-muted-foreground py-4">Cargando...</p>
                                ) : filteredUsers.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-4">No se encontraron usuarios</p>
                                ) : (
                                    filteredUsers.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => createConversation(u.id)}
                                            className="w-full p-3 flex items-center gap-3 hover:bg-muted rounded-lg transition-colors text-left"
                                        >
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <span className="font-medium text-primary">
                                                        {u.displayName?.[0] || u.username[0]}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
                                                    STATUS_COLORS[u.status] || STATUS_COLORS.offline
                                                )} />
                                            </div>
                                            <div>
                                                <p className="font-medium">{u.displayName || u.username}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {u.roles?.join(", ") || "Usuario"}
                                                </p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* File Preview Modal - use shared PreviewModal component */}
            <PreviewModal 
                file={previewFile ? { ...previewFile, originalName: previewFile.name } : null} 
                isOpen={!!previewFile} 
                onClose={() => { setPreviewFile(null); setPreviewUrl(null); }} 
            />
        </div>
    );
}
