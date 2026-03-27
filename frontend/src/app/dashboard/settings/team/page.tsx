"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/lib/i18n";
import {
    Loader2, Users, Shield, UserX, Plus, Trash2, Link as LinkIcon,
    Copy, FileText, Calendar, Image, Link2, Video, BarChart3,
    Activity, Folder, MessageSquare, ChevronDown, ChevronRight, Check
} from "lucide-react";

interface Role {
    id: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
    color?: string | null;
    level?: number | null;
    permissions: string[];
}

interface UserItem {
    id: string;
    username: string;
    email?: string | null;
    displayName: string;
    isAdmin: boolean;
    isActive: boolean;
    createdAt: string;
    roles: Role[];
}

interface InvitationItem {
    id: string;
    email?: string;
    username?: string;
    roles: string[];
    expiresAt: string;
    createdAt: string;
    inviteUrl?: string;
}

// ─── Permission Category Panel ──────────────────────────────────────────────
interface PermissionCategoryProps {
    label: string;
    icon: React.ElementType;
    permissions: { key: string; label: string }[];
    activePermissions: string[];
    onToggle: (key: string) => void;
    disabled?: boolean;
    defaultOpen?: boolean;
    getDisabledReason?: (key: string) => string | null;
}

function PermissionCategory({ label, icon: Icon, permissions, activePermissions, onToggle, disabled, defaultOpen = false, getDisabledReason }: PermissionCategoryProps) {
    const [open, setOpen] = useState(defaultOpen);
    const activeCount = permissions.filter(p => activePermissions.includes(p.key)).length;
    const allActive = activeCount === permissions.length;
    const someActive = activeCount > 0 && !allActive;

    const handleSelectAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;
        if (allActive) {
            permissions.forEach(p => activePermissions.includes(p.key) && onToggle(p.key));
        } else {
            permissions.forEach(p => !activePermissions.includes(p.key) && onToggle(p.key));
        }
    };

    return (
        <div className={`rounded-xl border transition-all ${open ? "border-border/70 shadow-sm" : "border-border/40"} overflow-hidden`}>
            {/* Header */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-semibold text-sm flex-1">{label}</span>

                {/* Badge */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    allActive ? "bg-primary/15 text-primary"
                    : someActive ? "bg-amber-500/15 text-amber-500"
                    : "bg-muted text-muted-foreground"
                }`}>
                    {activeCount}/{permissions.length}
                </span>

                {/* Select All toggle */}
                {!disabled && (
                    <button
                        type="button"
                        onClick={handleSelectAll}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 border transition-colors ${
                            allActive
                                ? "border-rose-400/40 text-rose-400 hover:bg-rose-500/10"
                                : "border-primary/40 text-primary hover:bg-primary/10"
                        }`}
                    >
                        {allActive ? "Quitar todos" : "Todos"}
                    </button>
                )}

                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
            </button>

            {/* Permissions grid */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {permissions.map(perm => {
                                const active = activePermissions.includes(perm.key);
                                const reason = getDisabledReason ? getDisabledReason(perm.key) : null;
                                const isDisabled = !!disabled || !!reason;
                                return (
                                    <button
                                        key={perm.key}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => onToggle(perm.key)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left
                                            ${active
                                                ? "bg-primary/10 border-primary/40 text-primary"
                                                : "bg-background border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                                            }
                                            ${(isDisabled) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                                        `}
                                        title={reason || undefined}
                                    >
                                        <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                                            active ? "bg-primary border-primary" : "border-border"
                                        }`}>
                                            {active && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                                        </span>
                                        <span className="min-w-0 truncate">
                                            {perm.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TeamRolesSettingsPage() {
    const { user } = useAuth();
    const { t } = useTranslation();

    // Permission dependency graph (Discord-like: coherent, safe defaults)
    // When enabling a permission, prerequisites are auto-enabled.
    // When disabling a prerequisite, dependents are auto-disabled.
    const PERM_REQUIRES: Record<string, string[]> = {
        // Admin / settings
        manage_roles: ["manage_users"],
        manage_integrations: ["manage_settings"],

        // Files
        download_files: ["view_files"],
        upload_files: ["view_files"],
        delete_files: ["view_files"],
        share_files: ["view_files"],
        preview_files: ["view_files"],
        view_workspace_files: ["view_files"],

        // Folders
        create_folders: ["view_folders"],
        delete_folders: ["view_folders"],
        organize_folders: ["view_folders"],

        // Notes
        create_notes: ["view_notes"],
        edit_notes: ["view_notes"],
        delete_notes: ["view_notes"],

        // Calendar
        create_events: ["view_calendar"],
        edit_events: ["view_calendar"],
        delete_events: ["view_calendar"],

        // Links
        create_links: ["view_links"],
        delete_links: ["view_links"],

        // Gallery
        upload_images: ["view_gallery"],
        delete_images: ["view_gallery"],

        // Chat
        send_messages: ["view_chat"],
        edit_messages: ["view_chat"],
        delete_messages: ["view_chat"],
        create_chats: ["view_chat"],
        create_group_chats: ["view_chat"],
        manage_group_chats: ["view_chat"],
        delete_conversations: ["view_chat"],
        mention_users: ["view_chat"],
        send_attachments: ["view_chat"],

        // Calls (if present)
        join_calls: ["view_calls"],
        create_calls: ["view_calls"],
        manage_calls: ["view_calls"],
    };

    const PERM_LABELS: Record<string, string> = {
        // keep minimal; used only for tooltips
        view_files: "Ver mis archivos",
        view_folders: "Ver carpetas",
        view_notes: "Ver notas",
        view_calendar: "Ver calendario",
        view_links: "Ver enlaces",
        view_gallery: "Ver galería",
        view_chat: "Ver chat",
        view_calls: "Ver llamadas",
        manage_users: "Gestionar usuarios",
        manage_roles: "Gestionar roles",
        manage_settings: "Configuración del sistema",
    };

    const computeDisabledReason = (activePermissions: string[], key: string): string | null => {
        if (activePermissions.includes("admin") && key !== "admin") {
            return "Admin activo (no hace falta activar permisos individuales)";
        }
        const reqs = PERM_REQUIRES[key] || [];
        const missing = reqs.filter(r => !activePermissions.includes(r));
        if (missing.length === 0) return null;
        const pretty = missing.map(m => PERM_LABELS[m] || m).join(", ");
        return `Requiere: ${pretty}`;
    };

    const applyToggleWithDeps = (current: string[], key: string) => {
        const set = new Set(current);

        const buildReverse = () => {
            const rev: Record<string, Set<string>> = {};
            Object.entries(PERM_REQUIRES).forEach(([perm, reqs]) => {
                reqs.forEach(req => {
                    if (!rev[req]) rev[req] = new Set();
                    rev[req].add(perm);
                });
            });
            return rev;
        };
        const REVERSE = buildReverse();

        const addWithReqs = (k: string) => {
            if (set.has(k)) return;
            set.add(k);
            (PERM_REQUIRES[k] || []).forEach(addWithReqs);
        };

        const removeWithDependents = (k: string) => {
            if (!set.has(k)) return;
            set.delete(k);
            (REVERSE[k] ? Array.from(REVERSE[k]) : []).forEach(removeWithDependents);
        };

        if (set.has(key)) {
            removeWithDependents(key);
        } else {
            addWithReqs(key);
        }

        // If admin toggled on, keep only admin for clarity (safer UX)
        if (set.has("admin")) {
            return ["admin"];
        }
        return Array.from(set);
    };

    const PERMISSION_CATEGORIES = [
        {
            key: "admin",
            label: t('settings.securityAndTeam') || 'Administración',
            icon: Shield,
            permissions: [
                { key: "admin", label: "Administrador total" },
                { key: "manage_users", label: "Gestionar usuarios" },
                { key: "manage_roles", label: "Gestionar roles" },
                { key: "manage_settings", label: "Configuración del sistema" },
                { key: "manage_integrations", label: "Gestionar integraciones" },
            ]
        },
        {
            key: "files",
            label: t('nav.files') || 'Archivos y Carpetas',
            icon: Folder,
            permissions: [
                { key: "view_files", label: "Ver mis archivos" },
                { key: "view_shared_files", label: "Ver archivos compartidos" },
                { key: "view_workspace_files", label: "Ver todos los archivos" },
                { key: "upload_files", label: "Subir archivos" },
                { key: "delete_files", label: "Eliminar archivos" },
                { key: "download_files", label: "Descargar archivos" },
                { key: "share_files", label: "Compartir archivos" },
                { key: "preview_files", label: "Vista previa" },
                { key: "create_folders", label: "Crear carpetas" },
                { key: "delete_folders", label: "Eliminar carpetas" },
                { key: "organize_folders", label: "Organizar carpetas" },
            ]
        },
        {
            key: "notes",
            label: t('nav.notes') || 'Notas',
            icon: FileText,
            permissions: [
                { key: "view_notes", label: "Ver notas" },
                { key: "create_notes", label: "Crear notas" },
                { key: "edit_notes", label: "Editar notas" },
                { key: "delete_notes", label: "Eliminar notas" },
            ]
        },
        {
            key: "calendar",
            label: t('nav.calendar') || 'Calendario',
            icon: Calendar,
            permissions: [
                { key: "view_calendar", label: "Ver calendario" },
                { key: "create_events", label: "Crear eventos" },
                { key: "edit_events", label: "Editar eventos" },
                { key: "delete_events", label: "Eliminar eventos" },
            ]
        },
        {
            key: "chat",
            label: t('nav.chat') || 'Chat',
            icon: MessageSquare,
            permissions: [
                { key: "view_chat", label: "Ver chat" },
                { key: "send_messages", label: "Enviar mensajes" },
                { key: "edit_messages", label: "Editar mensajes" },
                { key: "delete_messages", label: "Eliminar mensajes" },
                { key: "create_chats", label: "Crear chats" },
                { key: "create_group_chats", label: "Crear grupos" },
                { key: "mention_users", label: "Mencionar usuarios" },
                { key: "send_attachments", label: "Enviar archivos" },
            ]
        },
        {
            key: "links",
            label: t('nav.shared') || 'Enlaces',
            icon: Link2,
            permissions: [
                { key: "view_links", label: "Ver enlaces" },
                { key: "create_links", label: "Crear enlaces" },
                { key: "delete_links", label: "Eliminar enlaces" },
            ]
        },
        {
            key: "gallery",
            label: t('nav.gallery') || 'Galería',
            icon: Image,
            permissions: [
                { key: "view_gallery", label: "Ver galería" },
                { key: "upload_images", label: "Subir imágenes" },
                { key: "delete_images", label: "Eliminar imágenes" },
            ]
        },
        {
            key: "talk",
            label: t('nav.talk') || 'Videollamadas',
            icon: Video,
            permissions: [
                { key: "view_calls", label: "Ver videollamadas" },
                { key: "create_calls", label: "Crear videollamadas" },
                { key: "manage_calls", label: "Gestionar videollamadas" },
                { key: "join_calls", label: "Unirse a videollamadas" },
            ]
        },
        {
            key: "statistics",
            label: t('nav.statistics') || 'Estadísticas',
            icon: BarChart3,
            permissions: [
                { key: "view_statistics", label: "Ver estadísticas" },
                { key: "export_statistics", label: "Exportar estadísticas" },
            ]
        },
        {
            key: "activity",
            label: t('nav.activity') || 'Actividad',
            icon: Activity,
            permissions: [
                { key: "view_activity", label: "Ver actividad" },
                { key: "export_activity", label: "Exportar actividad" },
            ]
        }
    ];

    const allPermissions = PERMISSION_CATEGORIES.flatMap(c => c.permissions);

    // State
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<UserItem[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [invitations, setInvitations] = useState<InvitationItem[]>([]);

    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteTarget, setInviteTarget] = useState("");
    const [inviteRoleId, setInviteRoleId] = useState<string>("");
    const [inviteExpirationHours, setInviteExpirationHours] = useState<number>(72);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<"team" | "roles">("team");

    const [creatingRole, setCreatingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDescription, setNewRoleDescription] = useState("");
    const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

    // Expanded role in edit view
    const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [usersRes, rolesRes, invitesRes] = await Promise.all([
                    axios.get(API_ENDPOINTS.IAM.USERS, { withCredentials: true }),
                    axios.get(API_ENDPOINTS.IAM.ROLES, { withCredentials: true }),
                    axios.get(API_ENDPOINTS.IAM.TEAM_INVITATIONS, { withCredentials: true })
                ]);
                setUsers((usersRes.data && Array.isArray(usersRes.data)) ? usersRes.data : []);
                setRoles((rolesRes.data && Array.isArray(rolesRes.data)) ? rolesRes.data : []);
                setInvitations((invitesRes.data && Array.isArray(invitesRes.data)) ? invitesRes.data : []);
            } catch (err) {
                console.error("Failed to load team/roles data", err);
            } finally {
                setLoading(false);
            }
        };

        if (user && (user.isAdmin || user.permissions?.includes("manage_users") || user.permissions?.includes("manage_roles"))) {
            fetchAll();
        }
    }, [user]);

    const handleCopy = (text: string) => navigator.clipboard.writeText(text);

    const handleToggleActive = async (userId: string, isActive: boolean) => {
        try {
            await axios.patch(`${API_ENDPOINTS.IAM.USERS}/${userId}`, { isActive: !isActive }, { withCredentials: true });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !isActive } : u));
        } catch (err) { }
    };

    const handleChangeUserRole = async (userId: string, roleId: string) => {
        try {
            await axios.patch(`${API_ENDPOINTS.IAM.USERS}/${userId}`, { roles: roleId ? [roleId] : [] }, { withCredentials: true });
            const role = roles.find(r => r.id === roleId);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: role ? [role] : [] } : u));
        } catch (err) { }
    };

    const handleCreateInvite = async () => {
        if (!inviteTarget) return;
        setCreatingInvite(true);
        setGeneratedLink(null);
        const isEmail = inviteTarget.includes("@");
        const payload = {
            email: isEmail ? inviteTarget : undefined,
            username: !isEmail ? inviteTarget : undefined,
            roleIds: inviteRoleId ? [inviteRoleId] : [],
            expiresInHours: inviteExpirationHours
        };
        try {
            const res = await axios.post(API_ENDPOINTS.IAM.TEAM_INVITATIONS, payload, { withCredentials: true });
            setInvitations(prev => [res.data, ...prev]);
            setGeneratedLink(res.data.inviteUrl);
            setInviteTarget("");
        } catch (err) { } finally {
            setCreatingInvite(false);
        }
    };

    const handleRevokeInvite = async (id: string) => {
        try {
            await axios.delete(`${API_ENDPOINTS.IAM.TEAM_INVITATIONS}/${id}`, { withCredentials: true });
            setInvitations(prev => prev.filter(inv => inv.id !== id));
        } catch (err) { }
    };

    const togglePermissionInNewRole = (key: string) => {
        setNewRolePermissions(prev => applyToggleWithDeps(prev, key));
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;
        setCreatingRole(true);
        try {
            const res = await axios.post(API_ENDPOINTS.IAM.ROLES, {
                name: newRoleName.trim(),
                description: newRoleDescription.trim() || undefined,
                permissions: newRolePermissions,
            }, { withCredentials: true });
            setRoles(prev => [...prev, res.data]);
            setNewRoleName("");
            setNewRoleDescription("");
            setNewRolePermissions([]);
        } catch (err) { } finally {
            setCreatingRole(false);
        }
    };

    const handleTogglePermission = async (role: Role, key: string) => {
        const updatedPermissions = applyToggleWithDeps(role.permissions, key);
        try {
            await axios.patch(`${API_ENDPOINTS.IAM.ROLES}/${role.id}`, { permissions: updatedPermissions }, { withCredentials: true });
            setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: updatedPermissions } : r));
        } catch (err) { }
    };

    const handleDeleteRole = async (roleId: string) => {
        try {
            await axios.delete(`${API_ENDPOINTS.IAM.ROLES}/${roleId}`, { withCredentials: true });
            setRoles(prev => prev.filter(r => r.id !== roleId));
        } catch (err) { }
    };

    const canManageSecurity =
        !!user &&
        (user.isAdmin ||
            user.permissions?.includes("manage_users") ||
            user.permissions?.includes("manage_roles"));

    if (!canManageSecurity) {
        return (
            <div className="min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                {t('settings.noPermissionSecurity')}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{t('settings.securityAndTeam')}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t('settings.manageTeamDesc')}</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/60">
                <button
                    onClick={() => setActiveTab("team")}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "team" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    <Users className="w-4 h-4 inline-block mr-2" />
                    {t('settings.teamMembers')}
                </button>
                <button
                    onClick={() => setActiveTab("roles")}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "roles" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    <Shield className="w-4 h-4 inline-block mr-2" />
                    {t('settings.roles')}
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
                <div className="mt-6">

                    {/* ── TEAM TAB ─────────────────────────────────────────── */}
                    {activeTab === "team" && (
                        <div className="space-y-8">
                            {/* Invite Box */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <LinkIcon className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('settings.inviteMember')}</h2>
                                        <p className="text-xs text-muted-foreground">{t('settings.inviteDescription')}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-3">
                                    <Input
                                        placeholder={t('settings.inviteEmail') + " / " + t('auth.username')}
                                        value={inviteTarget}
                                        onChange={(e) => setInviteTarget(e.target.value)}
                                        className="md:flex-1"
                                    />
                                    <select className="border border-border/60 rounded-md bg-background px-2 py-2 text-sm" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
                                        <option value="">{t('settings.inviteRole')}</option>
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                    <select className="border border-border/60 rounded-md bg-background px-2 py-2 text-sm" value={inviteExpirationHours} onChange={(e) => setInviteExpirationHours(Number(e.target.value))}>
                                        <option value={1}>1 {t('statistics.hour')}</option>
                                        <option value={24}>24 {t('statistics.hour')}</option>
                                        <option value={72}>3 {t('statistics.days')}</option>
                                    </select>
                                    <Button onClick={handleCreateInvite} disabled={!inviteTarget || creatingInvite}>
                                        {creatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                        {t('settings.inviteMember')}
                                    </Button>
                                </div>

                                {generatedLink && (
                                    <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-4">
                                        <div className="truncate flex-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">{generatedLink}</div>
                                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleCopy(generatedLink)}>
                                            <Copy className="w-4 h-4 mr-2" /> {t('common.copy')}
                                        </Button>
                                    </div>
                                )}

                                {invitations.length > 0 && (
                                    <div className="mt-6 space-y-2">
                                        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">{t('settings.pendingInvites')}</h3>
                                        {invitations.map(inv => (
                                            <div key={inv.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border border-border/40 rounded-xl px-3 py-2.5 text-sm">
                                                <div>
                                                    <span className="font-semibold">{inv.username || inv.email}</span>
                                                    <span className="ml-2 text-xs text-muted-foreground">{t('settings.inviteRole')}: {inv.roles?.length ? roles.find(r => r.id === inv.roles[0])?.name : t('settings.noRoles')}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[11px] text-muted-foreground">{new Date(inv.expiresAt).toLocaleString()}</span>
                                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => handleRevokeInvite(inv.id)}>
                                                        {t('common.cancel')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>

                            {/* Users Table */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Users className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('settings.teamMembers')}</h2>
                                        <p className="text-xs text-muted-foreground">{t('settings.manageTeamDesc')}</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/50 text-xs text-muted-foreground">
                                                <th className="py-2 text-left font-semibold">{t('auth.username')}</th>
                                                <th className="py-2 text-left font-semibold">{t('settings.inviteRole')}</th>
                                                <th className="py-2 text-left font-semibold">{t('statistics.overview')}</th>
                                                <th className="py-2 text-right font-semibold">{t('common.settings')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.id} className="border-b border-border/30 last:border-0">
                                                    <td className="py-2 pr-3">
                                                        <div className="font-semibold">{u.displayName}</div>
                                                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                                                        {u.email && <div className="text-[10px] text-muted-foreground">{u.email}</div>}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <select
                                                            className="text-xs border border-border/60 rounded-md bg-background px-2 py-1"
                                                            value={u.roles[0]?.id || ""}
                                                            onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                                                            disabled={u.isAdmin}
                                                        >
                                                            {u.isAdmin ? (
                                                                <option>{t('permissions.admin')}</option>
                                                            ) : (
                                                                <>
                                                                    <option value="">{t('settings.noRoles')}</option>
                                                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                                </>
                                                            )}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                                                            {u.isActive ? t('chat.status.online') : t('chat.status.offline')}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        {!u.isAdmin && (
                                                            <Button size="sm" variant="ghost" className="h-8" onClick={() => handleToggleActive(u.id, u.isActive)}>
                                                                {u.isActive ? t('settings.removeMember') : t('common.next')}
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {/* ── ROLES TAB ─────────────────────────────────────────── */}
                    {activeTab === "roles" && (
                        <div className="space-y-8">

                            {/* Create Role */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Plus className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{t('settings.addRole')}</h2>
                                        <p className="text-xs text-muted-foreground">Define un nuevo rol con permisos específicos por módulo</p>
                                    </div>
                                </div>

                                {/* Name + Description + Save */}
                                <div className="flex gap-3 mb-5">
                                    <Input placeholder={t('settings.roleName')} value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="flex-1" />
                                    <Input placeholder={t('settings.roleDescription')} value={newRoleDescription} onChange={e => setNewRoleDescription(e.target.value)} className="flex-[2]" />
                                    <Button onClick={handleCreateRole} disabled={!newRoleName || creatingRole}>
                                        {creatingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
                                    </Button>
                                </div>

                                {/* Permission categories */}
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('settings.permissions')}</p>
                                    {PERMISSION_CATEGORIES.map((cat, i) => (
                                        <PermissionCategory
                                            key={cat.key}
                                            label={cat.label}
                                            icon={cat.icon}
                                            permissions={cat.permissions}
                                            activePermissions={newRolePermissions}
                                            onToggle={togglePermissionInNewRole}
                                            defaultOpen={i === 0}
                                            getDisabledReason={(key) => computeDisabledReason(newRolePermissions, key)}
                                        />
                                    ))}
                                </div>
                            </motion.div>

                            {/* Visual Permission Overview */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-gradient-to-br from-card to-card/50 border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center">
                                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Resumen de Permisos</h2>
                                        <p className="text-xs text-muted-foreground">Vista visual de permisos por categoría</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {PERMISSION_CATEGORIES.map(cat => {
                                        const activeCount = cat.permissions.filter(p => newRolePermissions.includes(p.key)).length;
                                        const totalCount = cat.permissions.length;
                                        const percentage = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
                                        
                                        return (
                                            <div key={cat.key} className="bg-muted/30 rounded-xl p-4 border border-border/40">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <cat.icon className="w-4 h-4 text-primary" />
                                                        </div>
                                                        <span className="font-medium text-sm">{cat.label}</span>
                                                    </div>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                                        percentage === 100 ? 'bg-emerald-500/20 text-emerald-500' :
                                                        percentage > 50 ? 'bg-blue-500/20 text-blue-500' :
                                                        percentage > 0 ? 'bg-amber-500/20 text-amber-500' :
                                                        'bg-muted text-muted-foreground'
                                                    }`}>
                                                        {activeCount}/{totalCount}
                                                    </span>
                                                </div>
                                                
                                                {/* Progress bar */}
                                                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                                                    <motion.div 
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${percentage}%` }}
                                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                                        className={`h-full rounded-full ${
                                                            percentage === 100 ? 'bg-emerald-500' :
                                                            percentage > 50 ? 'bg-blue-500' :
                                                            percentage > 0 ? 'bg-amber-500' :
                                                            'bg-muted'
                                                        }`}
                                                    />
                                                </div>
                                                
                                                {/* Permission badges */}
                                                <div className="flex flex-wrap gap-1">
                                                    {cat.permissions.map(p => {
                                                        const isActive = newRolePermissions.includes(p.key);
                                                        return (
                                                            <span 
                                                                key={p.key} 
                                                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                                                    isActive 
                                                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                                                                        : 'bg-muted/50 text-muted-foreground border border-transparent'
                                                                }`}
                                                            >
                                                                {isActive ? '✓' : '✗'} {p.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>

                            {/* Roles List */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Roles existentes</p>
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
                                    {roles.map(role => {
                                        const totalPerms = allPermissions.length;
                                        const activePerms = role.permissions.length;
                                        const isExpanded = expandedRoleId === role.id;

                                        return (
                                            <div key={role.id} className="bg-background border border-border/60 rounded-2xl shadow-sm overflow-hidden">
                                                {/* Role header row */}
                                                <div
                                                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                                                    onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                                                >
                                                    {/* Discord-like role color */}
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span
                                                            className="w-2.5 h-9 rounded-full"
                                                            style={{ backgroundColor: role.color || "#7289DA" }}
                                                        />
                                                        <div
                                                            className="w-9 h-9 rounded-xl flex items-center justify-center border border-border/50"
                                                            style={{ backgroundColor: `${role.color || "#7289DA"}1A` }}
                                                        >
                                                            <Shield className="w-4 h-4" style={{ color: role.color || "#7289DA" }} />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm">{role.name}</span>
                                                            {typeof role.level === "number" && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold">
                                                                    L{role.level}
                                                                </span>
                                                            )}
                                                            {role.isSystem && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                                                                    {t('notifications.types.system')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {role.description && <p className="text-xs text-muted-foreground truncate">{role.description}</p>}
                                                    </div>

                                                    {/* Permission summary pills */}
                                                    <div className="hidden md:flex items-center gap-1.5 flex-wrap justify-end max-w-[320px]">
                                                        {PERMISSION_CATEGORIES.map(cat => {
                                                            const count = cat.permissions.filter(p => role.permissions.includes(p.key)).length;
                                                            if (count === 0) return null;
                                                            return (
                                                                <span key={cat.key} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                                    <cat.icon className="w-2.5 h-2.5" />
                                                                    {count}
                                                                </span>
                                                            );
                                                        })}
                                                        {activePerms === 0 && (
                                                            <span className="text-[10px] text-muted-foreground italic">Sin permisos</span>
                                                        )}
                                                    </div>

                                                    <span className="text-[11px] text-muted-foreground shrink-0 ml-2 hidden sm:block">
                                                        {activePerms}/{totalPerms}
                                                    </span>

                                                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />

                                                    {!role.isSystem && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0 ml-1"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    )}
                                                </div>

                                                {/* Expanded permissions by category */}
                                                <AnimatePresence initial={false}>
                                                    {isExpanded && (
                                                        <motion.div
                                                            key="perms"
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                                            className="overflow-hidden border-t border-border/40"
                                                        >
                                                            <div className="p-4 space-y-2 bg-muted/10">
                                                                {PERMISSION_CATEGORIES.map(cat => (
                                                                    <PermissionCategory
                                                                        key={cat.key}
                                                                        label={cat.label}
                                                                        icon={cat.icon}
                                                                        permissions={cat.permissions}
                                                                        activePermissions={role.permissions}
                                                                        onToggle={(key) => handleTogglePermission(role, key)}
                                                                        disabled={role.isSystem}
                                                                        getDisabledReason={(key) => computeDisabledReason(role.permissions, key)}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}