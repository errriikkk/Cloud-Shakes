"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Users, Shield, Mail, UserX, Plus, Trash2, Link as LinkIcon, Copy } from "lucide-react";

interface Role {
    id: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
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
    inviteUrl?: string; // Generated link
}

const AVAILABLE_PERMISSIONS: { key: string; label: string }[] = [
    { key: "manage_users", label: "Gestionar usuarios" },
    { key: "manage_roles", label: "Gestionar roles" },
    { key: "view_activity", label: "Ver auditoría" },
    { key: "view_files", label: "Archivos" },
    { key: "view_documents", label: "Documentos" },
    { key: "view_notes", label: "Notas" },
    { key: "view_calendar", label: "Calendario" },
    { key: "view_links", label: "Enlaces" },
    { key: "view_gallery", label: "Galería" },
    { key: "view_statistics", label: "Estadísticas" },
    { key: "view_api_builder", label: "API Builder" },
];

export default function TeamRolesSettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<"team" | "roles">("team");

    // Unified Data State
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<UserItem[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [invitations, setInvitations] = useState<InvitationItem[]>([]);

    // Invite State
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteTarget, setInviteTarget] = useState(""); // Email or Username
    const [inviteRoleId, setInviteRoleId] = useState<string>("");
    const [inviteExpirationHours, setInviteExpirationHours] = useState<number>(72);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);

    // Roles state
    const [creatingRole, setCreatingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDescription, setNewRoleDescription] = useState("");
    const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [usersRes, rolesRes, invitesRes] = await Promise.all([
                    axios.get(API_ENDPOINTS.IAM.USERS, { withCredentials: true }),
                    axios.get(API_ENDPOINTS.IAM.ROLES, { withCredentials: true }),
                    axios.get(API_ENDPOINTS.IAM.TEAM_INVITATIONS, { withCredentials: true })
                ]);
                setUsers(usersRes.data);
                setRoles(rolesRes.data);
                setInvitations(invitesRes.data);
            } catch (err) {
                console.error("Failed to load team/roles data", err);
            } finally {
                setLoading(false);
            }
        };

        if (user?.isAdmin) {
            fetchAll();
        }
    }, [user]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // --- Team Actions ---
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
        } catch (err) {
            console.error("Failed to create invitation", err);
        } finally {
            setCreatingInvite(false);
        }
    };

    const handleRevokeInvite = async (id: string) => {
        try {
            await axios.delete(`${API_ENDPOINTS.IAM.TEAM_INVITATIONS}/${id}`, { withCredentials: true });
            setInvitations(prev => prev.filter(inv => inv.id !== id));
        } catch (err) { }
    };

    // --- Role Actions ---
    const togglePermissionInNewRole = (key: string) => {
        setNewRolePermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
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
        const updatedPermissions = role.permissions.includes(key)
            ? role.permissions.filter(p => p !== key)
            : [...role.permissions, key];
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

    if (!user?.isAdmin) {
        return <div className="min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">Solo el administrador puede gestionar la seguridad y el equipo.</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Seguridad y Equipo</h1>
                <p className="text-sm text-muted-foreground mt-1">Gestiona accesos, invitaciones temporales y roles en un solo lugar.</p>
            </div>

            {/* TABS */}
            <div className="flex border-b border-border/60">
                <button
                    onClick={() => setActiveTab("team")}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "team" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Equipo e Invitaciones
                </button>
                <button
                    onClick={() => setActiveTab("roles")}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "roles" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Roles y Permisos
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
                <div className="mt-6">
                    {activeTab === "team" && (
                        <div className="space-y-8">
                            {/* Invites Box */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <LinkIcon className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Generar Enlace de Invitación</h2>
                                        <p className="text-xs text-muted-foreground">Invita usuarios inmediatamente proporcionando su nombre de usuario deseado o un correo.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-3">
                                    <Input
                                        placeholder="Nombre de usuario o Email"
                                        value={inviteTarget}
                                        onChange={(e) => setInviteTarget(e.target.value)}
                                        className="md:flex-1"
                                    />
                                    <select
                                        className="border border-border/60 rounded-md bg-background px-2 py-2 text-sm"
                                        value={inviteRoleId}
                                        onChange={(e) => setInviteRoleId(e.target.value)}
                                    >
                                        <option value="">Permisos por defecto (Sin Rol)</option>
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                    <select
                                        className="border border-border/60 rounded-md bg-background px-2 py-2 text-sm"
                                        value={inviteExpirationHours}
                                        onChange={(e) => setInviteExpirationHours(Number(e.target.value))}
                                    >
                                        <option value={1}>Expira en 1 Hora</option>
                                        <option value={24}>Expira en 24 Horas</option>
                                        <option value={72}>Expira en 3 Días</option>
                                    </select>
                                    <Button onClick={handleCreateInvite} disabled={!inviteTarget || creatingInvite}>
                                        {creatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                        Crear Enlace
                                    </Button>
                                </div>

                                {generatedLink && (
                                    <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-4">
                                        <div className="truncate flex-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                            {generatedLink}
                                        </div>
                                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleCopy(generatedLink)}>
                                            <Copy className="w-4 h-4 mr-2" /> Copiar Enlace
                                        </Button>
                                    </div>
                                )}

                                {/* Pending Invites */}
                                {invitations.length > 0 && (
                                    <div className="mt-6 space-y-2">
                                        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Enlaces Pendientes</h3>
                                        {invitations.map(inv => (
                                            <div key={inv.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border border-border/40 rounded-xl px-3 py-2.5 text-sm">
                                                <div>
                                                    <span className="font-semibold">{inv.username || inv.email}</span>
                                                    <span className="ml-2 text-xs text-muted-foreground">Rol: {inv.roles?.length ? roles.find(r => r.id === inv.roles[0])?.name : 'Por defecto'}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[11px] text-muted-foreground">{new Date(inv.expiresAt).toLocaleString()}</span>
                                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => handleRevokeInvite(inv.id)}>
                                                        Revocar
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
                                        <h2 className="text-lg font-bold">Miembros del Espacio</h2>
                                        <p className="text-xs text-muted-foreground">Gestiona accesos globales y asigna roles a usuarios existentes.</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/50 text-xs text-muted-foreground">
                                                <th className="py-2 text-left font-semibold">Usuario</th>
                                                <th className="py-2 text-left font-semibold">Rol</th>
                                                <th className="py-2 text-left font-semibold">Estado</th>
                                                <th className="py-2 text-right font-semibold">Acciones</th>
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
                                                                <option>Administrador</option>
                                                            ) : (
                                                                <>
                                                                    <option value="">Por defecto (Sin rol)</option>
                                                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                                </>
                                                            )}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                                                            {u.isActive ? "Activo" : "Suspendido"}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        {!u.isAdmin && (
                                                            <Button size="sm" variant="ghost" className="h-8" onClick={() => handleToggleActive(u.id, u.isActive)}>
                                                                {u.isActive ? "Suspender" : "Reactivar"}
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

                    {activeTab === "roles" && (
                        <div className="space-y-8">
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Plus className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">Crear Nuevo Rol</h2>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        <Input placeholder="Nombre del Rol" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="flex-1" />
                                        <Input placeholder="Descripción (opcional)" value={newRoleDescription} onChange={e => setNewRoleDescription(e.target.value)} className="flex-[2]" />
                                        <Button onClick={handleCreateRole} disabled={!newRoleName || creatingRole}>
                                            {creatingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
                                        </Button>
                                    </div>
                                    <div className="pt-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Permisos Opcionales</div>
                                        <div className="flex flex-wrap gap-2">
                                            {AVAILABLE_PERMISSIONS.map(perm => (
                                                <button
                                                    key={perm.key}
                                                    onClick={() => togglePermissionInNewRole(perm.key)}
                                                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${newRolePermissions.includes(perm.key) ? "bg-primary/10 text-primary border-primary/50" : "bg-muted/40 text-muted-foreground"}`}
                                                >
                                                    {perm.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
                                {roles.map(role => (
                                    <div key={role.id} className="bg-background border border-border/60 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-base">{role.name}</span>
                                                    {role.isSystem && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">Sistema</span>}
                                                </div>
                                                {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                                            </div>
                                            {!role.isSystem && (
                                                <Button size="sm" variant="ghost" className="h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => handleDeleteRole(role.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {AVAILABLE_PERMISSIONS.map(perm => (
                                                <button
                                                    key={perm.key}
                                                    onClick={() => !role.isSystem && handleTogglePermission(role, perm.key)}
                                                    disabled={role.isSystem}
                                                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${role.permissions.includes(perm.key) ? "bg-primary/10 text-primary border-primary/50" : "bg-muted/40 text-muted-foreground"} ${role.isSystem ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                >
                                                    {perm.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
