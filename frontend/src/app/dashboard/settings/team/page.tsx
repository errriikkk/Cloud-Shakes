"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion } from "framer-motion";
import { Loader2, Users, Shield, Mail, UserX } from "lucide-react";

interface Role {
    id: string;
    name: string;
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
    email: string;
    roles: string[];
    expiresAt: string;
    createdAt: string;
    inviteUrl?: string;
}

export default function TeamSettingsPage() {
    const { user } = useAuth();
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingInvites, setLoadingInvites] = useState(true);
    const [users, setUsers] = useState<UserItem[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [invitations, setInvitations] = useState<InvitationItem[]>([]);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRoleId, setInviteRoleId] = useState<string>("");

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [usersRes, rolesRes] = await Promise.all([
                    axios.get(API_ENDPOINTS.IAM.USERS, { withCredentials: true }),
                    axios.get(API_ENDPOINTS.IAM.ROLES, { withCredentials: true }),
                ]);
                setUsers(usersRes.data);
                setRoles(rolesRes.data);
            } catch (err) {
                console.error("Failed to load team data", err);
            } finally {
                setLoadingUsers(false);
            }
        };

        const fetchInvitations = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.IAM.TEAM_INVITATIONS, { withCredentials: true });
                setInvitations(res.data);
            } catch (err) {
                console.error("Failed to load invitations", err);
            } finally {
                setLoadingInvites(false);
            }
        };

        fetchData();
        fetchInvitations();
    }, []);

    const handleToggleActive = async (userId: string, isActive: boolean) => {
        try {
            await axios.patch(
                `${API_ENDPOINTS.IAM.USERS}/${userId}`,
                { isActive: !isActive },
                { withCredentials: true },
            );
            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, isActive: !isActive } : u)),
            );
        } catch (err) {
            console.error("Failed to toggle user status", err);
        }
    };

    const handleChangeUserRole = async (userId: string, roleId: string) => {
        try {
            await axios.patch(
                `${API_ENDPOINTS.IAM.USERS}/${userId}`,
                { roles: [roleId] },
                { withCredentials: true },
            );
            const role = roles.find((r) => r.id === roleId);
            if (!role) return;
            setUsers((prev) =>
                prev.map((u) =>
                    u.id === userId ? { ...u, roles: [role] } : u,
                ),
            );
        } catch (err) {
            console.error("Failed to update user role", err);
        }
    };

    const handleCreateInvite = async () => {
        if (!inviteEmail || !inviteRoleId) return;
        setCreatingInvite(true);
        try {
            const res = await axios.post(
                API_ENDPOINTS.IAM.TEAM_INVITATIONS,
                { email: inviteEmail, roleIds: [inviteRoleId] },
                { withCredentials: true },
            );
            setInvitations((prev) => [res.data, ...prev]);
            setInviteEmail("");
            setInviteRoleId("");
        } catch (err) {
            console.error("Failed to create invitation", err);
        } finally {
            setCreatingInvite(false);
        }
    };

    const handleRevokeInvite = async (id: string) => {
        try {
            await axios.delete(`${API_ENDPOINTS.IAM.TEAM_INVITATIONS}/${id}`, {
                withCredentials: true,
            });
            setInvitations((prev) => prev.filter((inv) => inv.id !== id));
        } catch (err) {
            console.error("Failed to revoke invitation", err);
        }
    };

    if (!user?.isAdmin) {
        return (
            <div className="min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                Solo el administrador puede gestionar el equipo.
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Equipo</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Invita a más personas a tu nube y gestiona sus permisos de acceso.
                </p>
            </div>

            {/* Usuarios */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Miembros del espacio</h2>
                        <p className="text-xs text-muted-foreground">
                            Activa, suspende y cambia el rol de los usuarios de este Cloud.
                        </p>
                    </div>
                </div>

                {loadingUsers ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Cargando equipo...
                    </div>
                ) : users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay usuarios todavía.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                                    <th className="py-2 text-left font-semibold">Usuario</th>
                                    <th className="py-2 text-left font-semibold">Email</th>
                                    <th className="py-2 text-left font-semibold">Rol</th>
                                    <th className="py-2 text-left font-semibold">Estado</th>
                                    <th className="py-2 text-right font-semibold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-border/30 last:border-0">
                                        <td className="py-2 pr-3">
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{u.displayName || u.username}</span>
                                                <span className="text-xs text-muted-foreground">@{u.username}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                                            {u.email || "—"}
                                        </td>
                                        <td className="py-2 pr-3">
                                            <select
                                                className="text-xs border border-border/60 rounded-md bg-background px-2 py-1"
                                                value={u.roles[0]?.id || ""}
                                                onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                                            >
                                                <option value="">Sin rol</option>
                                                {roles.map((r) => (
                                                    <option key={r.id} value={r.id}>
                                                        {r.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-2 pr-3">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.isActive
                                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                                    }`}
                                            >
                                                {u.isActive ? "Activo" : "Suspendido"}
                                            </span>
                                        </td>
                                        <td className="py-2 text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleToggleActive(u.id, u.isActive)}
                                            >
                                                <UserX className="w-3 h-3 mr-1.5" />
                                                {u.isActive ? "Suspender" : "Reactivar"}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {/* Invitaciones */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Invitaciones pendientes</h2>
                        <p className="text-xs text-muted-foreground">
                            Envía enlaces de invitación con un rol preconfigurado.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <Input
                        type="email"
                        placeholder="email@ejemplo.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="md:flex-1"
                    />
                    <select
                        className="border border-border/60 rounded-md bg-background px-2 py-2 text-sm md:w-56"
                        value={inviteRoleId}
                        onChange={(e) => setInviteRoleId(e.target.value)}
                    >
                        <option value="">Selecciona un rol</option>
                        {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                    <Button
                        onClick={handleCreateInvite}
                        disabled={!inviteEmail || !inviteRoleId || creatingInvite}
                    >
                        {creatingInvite ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Shield className="w-4 h-4 mr-2" />
                                Invitar
                            </>
                        )}
                    </Button>
                </div>

                {loadingInvites ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cargando invitaciones...
                    </div>
                ) : invitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No hay invitaciones activas.
                    </p>
                ) : (
                    <div className="space-y-3 text-xs">
                        {invitations.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex flex-col md:flex-row md:items-center justify-between gap-2 border border-border/40 rounded-xl px-3 py-2.5"
                            >
                                <div className="space-y-0.5">
                                    <div className="font-semibold text-foreground">{inv.email}</div>
                                    <div className="text-muted-foreground">
                                        Roles:{" "}
                                        {Array.isArray(inv.roles)
                                            ? (inv.roles as string[]).length
                                                ? (inv.roles as string[]).length
                                                : "—"
                                            : "—"}
                                    </div>
                                    {inv.inviteUrl && (
                                        <div className="text-[11px] text-muted-foreground break-all">
                                            Enlace: {inv.inviteUrl}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="text-[11px] text-muted-foreground">
                                        Expira:{" "}
                                        {new Date(inv.expiresAt).toLocaleString()}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRevokeInvite(inv.id)}
                                    >
                                        Revocar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

