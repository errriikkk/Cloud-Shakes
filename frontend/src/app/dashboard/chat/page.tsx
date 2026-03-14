"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { 
    MessageSquare, Send, Users, MoreVertical, Phone, Video,
    Bell, BellOff, Circle, Search, Plus, X, Check, Pencil, ChevronLeft, Trash2,
    FileText, Folder
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermission } from "@/hooks/usePermission";
import { motion, AnimatePresence } from "framer-motion";

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
    const [showSidebar, setShowSidebar] = useState(true);
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
            setConversations(res.data);
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
            setUsers(res.data);
        } catch (err) {
            console.error("Failed to fetch users:", err);
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

            const handleClick = async () => {
                if (!hasAccess) return;
                
                if (part.mentionType === 'folder') {
                    // For folders, navigate to files page
                    window.location.href = `/dashboard/files?folderId=${part.id}`;
                } else if (part.mentionType === 'file') {
                    // For files, open preview modal
                    setPreviewFile({ id: part.id!, name: part.name!, mimeType: '' });
                    setPreviewLoading(true);
                    
                    try {
                        // Get file details and preview URL
                        const res = await axios.get(`${API_ENDPOINTS.FILES.BASE}/${part.id}`, { withCredentials: true });
                        const file = res.data;
                        setPreviewFile({ id: file.id, name: file.originalName, mimeType: file.mimeType });
                        
                        // Get preview URL
                        const previewRes = await axios.get(`${API_ENDPOINTS.FILES.BASE}/${file.id}/preview`, { withCredentials: true });
                        setPreviewUrl(previewRes.data.url);
                    } catch (err) {
                        console.error("Failed to get file preview:", err);
                    } finally {
                        setPreviewLoading(false);
                    }
                }
            };

            return (
                <span key={idx} className="mx-0.5">
                    <span
                        onClick={handleClick}
                        className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200",
                            hasAccess 
                                ? part.mentionType === 'file' 
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 hover:scale-105 hover:shadow-md hover:shadow-blue-200/50"
                                    : "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 hover:scale-105 hover:shadow-md hover:shadow-green-200/50"
                                : "bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed"
                        )}
                    >
                        {part.mentionType === 'file' ? (
                            <FileText className="w-3 h-3" />
                        ) : part.mentionType === 'folder' ? (
                            <Folder className="w-3 h-3" />
                        ) : (
                            <span className="w-3 h-3 rounded-full bg-primary/20 flex items-center justify-center text-[8px]">@</span>
                        )}
                        <span className="max-w-[100px] truncate">{part.name}</span>
                        {!hasAccess && part.mentionType !== 'user' && (
                            <span className="text-[10px] opacity-70">(sin acceso)</span>
                        )}
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
        <div className="flex h-[calc(100vh-4rem)] relative">
            {/* Sidebar - full width on mobile/tablet, hidden when chat open */}
            <div className={cn(
                "w-full lg:w-80 border-r border-border flex flex-col bg-background",
                "absolute lg:relative z-20 h-full transition-all duration-300",
                activeConversation ? "hidden lg:flex" : "flex"
            )}>
                {/* Header - sticky */}
                <div className="sticky top-0 z-10 p-4 border-b border-border bg-gradient-to-b from-background to-muted/20 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-primary" />
                            {t('chat.title')}
                        </h1>
                        <button
                            onClick={() => canCreateChats() && setShowNewChat(true)}
                            disabled={!canCreateChats()}
                            title={canCreateChats() ? t('chat.newChat') : t('chat.noPermission')}
                            className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    
                    {/* Status selector - more beautiful */}
                    <div className="flex items-center gap-3 mb-3 p-2 rounded-xl bg-muted/30">
                        <div className="relative">
                            <div className={cn("w-3 h-3 rounded-full ring-2 ring-background", STATUS_COLORS[userStatus])} />
                        </div>
                        <select
                            value={userStatus}
                            onChange={(e) => updateStatus(e.target.value)}
                            className="text-sm bg-transparent border-none outline-none cursor-pointer flex-1 font-medium"
                        >
                            <option value="online">{t('chat.status.online')}</option>
                            <option value="away">{t('chat.status.away')}</option>
                            <option value="dnd">{t('chat.status.dnd')}</option>
                            <option value="offline">{t('chat.status.offline')}</option>
                        </select>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('chat.searchConversations')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                        />
                    </div>
                </div>

                {/* Conversations list */}
                <div className="flex-1 overflow-y-auto">
                    {filteredConversations.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                            <p className="text-sm">{t('chat.noConversations')}</p>
                            {canCreateChats() && (
                                <button 
                                    onClick={() => setShowNewChat(true)}
                                    className="text-primary text-sm hover:underline mt-2"
                                >
                                    {t('chat.startConversation')}
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredConversations.map(conv => {
                            const avatar = getConversationAvatar(conv);
                            const isActive = activeConversation?.id === conv.id;
                            
                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => setActiveConversation(conv)}
                                    className={cn(
                                        "w-full p-4 flex items-center gap-3 transition-all duration-200 text-left group",
                                        "hover:bg-muted/50 active:scale-[0.98]",
                                        "focus:ring-2 focus:ring-primary/30 focus:ring-inset",
                                        isActive && "bg-primary/10 border-l-2 border-l-primary"
                                    )}
                                >
                                    <div className="relative flex-shrink-0">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                                            {avatar?.avatar ? (
                                                <img src={avatar.avatar} alt="" className="w-full h-full rounded-xl object-cover" />
                                            ) : (
                                                <span className="text-lg font-semibold text-primary">
                                                    {avatar?.displayName?.[0] || avatar?.username[0] || "?"}
                                                </span>
                                            )}
                                        </div>
                                        {avatar && (
                                            <div className={cn(
                                                "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background",
                                                STATUS_COLORS[avatar.status] || STATUS_COLORS.offline
                                            )} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium truncate text-sm">
                                                {getConversationName(conv)}
                                            </p>
                                            {conv.lastMessage && (
                                                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                                    {formatMessageTime(conv.lastMessage.createdAt)}
                                                </span>
                                            )}
                                        </div>
                                        {conv.lastMessage && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {conv.lastMessage.senderId === user?.id ? "Tú: " : ""}
                                                {conv.lastMessage.content}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Main chat area */}
            <div className="flex-1 flex flex-col">
                {activeConversation ? (
                    <>
                        {/* Chat header - sticky */}
                        <div className="sticky top-0 z-10 p-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-background to-muted/10 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                {/* Back button for mobile/tablet */}
                                <button 
                                    onClick={() => setActiveConversation(null)}
                                    className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center ring-2 ring-primary/10">
                                        <span className="font-semibold text-primary">
                                            {getConversationName(activeConversation)[0]}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <h2 className="font-semibold">{getConversationName(activeConversation)}</h2>
                                    <p className="text-xs text-muted-foreground">
                                        {activeConversation.isGroup 
                                            ? `${activeConversation.participants.length} ${t('chat.header.members')}`
                                            : t('chat.header.online')
                                        }
                                    </p>
                                </div>
                            </div>
                            <div className="relative">
                                <button 
                                    onClick={() => setShowConversationMenu(!showConversationMenu)}
                                    className="p-2 rounded-xl hover:bg-muted transition-colors"
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                                
                                {/* Conversation menu */}
                                {showConversationMenu && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
                                    >
                                        {canDeleteConversations() && (
                                            <button
                                                onClick={() => deleteConversation(activeConversation.id)}
                                                className="w-full px-4 py-3 text-left text-sm hover:bg-muted flex items-center gap-3 text-red-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                {t('chat.menu.deleteChat')}
                                            </button>
                                        )}
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gradient-to-b from-background via-background to-muted/5 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                            {messages.map((msg, idx) => {
                                const isOwn = msg.senderId === user?.id;
                                const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
                                
                                return (
                                    <div
                                        key={msg.id}
                                        className={cn("flex gap-2 group", isOwn && "flex-row-reverse")}
                                    >
                                        {showAvatar ? (
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center flex-shrink-0 ring-2 ring-background shadow-sm">
                                                <span className="text-sm font-semibold text-primary">
                                                    {msg.sender.displayName?.[0] || msg.sender.username[0]}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="w-9" />
                                        )}
                                        <div className={cn("max-w-[75%] relative", isOwn && "text-right")}>
                                            {showAvatar && (
                                                <p className="text-[10px] text-muted-foreground mb-1 px-2 font-medium">
                                                    {msg.sender.displayName || msg.sender.username}
                                                </p>
                                            )}
                                            <div className="flex items-end gap-1">
                                                <div className={cn(
                                                    "inline-block px-4 py-2.5 rounded-2xl shadow-sm transition-all duration-200",
                                                    "hover:shadow-md",
                                                    isOwn 
                                                        ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-md" 
                                                        : "bg-card border border-border/50 rounded-bl-md"
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
                                                                "absolute top-full mt-1 w-36 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl z-50 overflow-hidden",
                                                                isOwn ? "right-0" : "left-0"
                                                            )}
                                                        >
                                                            {(isOwn || canDeleteMessages()) && (
                                                                <button
                                                                    onClick={() => deleteMessage(msg.id)}
                                                                    className="w-full px-3 py-3 text-left text-sm hover:bg-red-500/10 flex items-center gap-2 text-red-500 transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                    Eliminar
                                                                </button>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-1 px-2">
                                                {format(new Date(msg.createdAt), "HH:mm")}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Message input */}
                        <div className="p-4 border-t border-border">
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
                                    className="flex-1 px-4 py-2 bg-muted rounded-full outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                            <h2 className="text-xl font-semibold">{t('chat.noConversations')}</h2>
                            <p className="text-muted-foreground mt-2">{t('chat.startConversation')}</p>
                        </div>
                    </div>
                )}
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
                                placeholder="Buscar usuarios..."
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
            
            {/* File Preview Modal */}
            <AnimatePresence>
                {previewFile && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                        onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-background rounded-xl max-w-4xl max-h-[90vh] w-full overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b">
                                <h3 className="font-semibold truncate">{previewFile.name}</h3>
                                <button
                                    onClick={() => { setPreviewFile(null); setPreviewUrl(null); }}
                                    className="p-2 hover:bg-muted rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 flex items-center justify-center min-h-[400px] bg-black/5">
                                {previewLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span>Cargando...</span>
                                    </div>
                                ) : previewUrl ? (
                                    previewFile.mimeType?.startsWith('image/') ? (
                                        <img 
                                            src={previewUrl} 
                                            alt={previewFile.name}
                                            className="max-w-full max-h-[60vh] object-contain"
                                        />
                                    ) : previewFile.mimeType?.startsWith('video/') ? (
                                        <video 
                                            src={previewUrl} 
                                            controls 
                                            className="max-w-full max-h-[60vh]"
                                        />
                                    ) : previewFile.mimeType?.startsWith('audio/') ? (
                                        <audio 
                                            src={previewUrl} 
                                            controls 
                                            className="w-full"
                                        />
                                    ) : (
                                        <div className="text-center">
                                            <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                                            <p className="text-muted-foreground">Vista previa no disponible</p>
                                            <a 
                                                href={previewUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline mt-2 inline-block"
                                            >
                                                Abrir en nueva pestaña
                                            </a>
                                        </div>
                                    )
                                ) : (
                                    <p className="text-muted-foreground">Error al cargar la vista previa</p>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
