"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion } from "framer-motion";
import { Shield, Plus, Loader2, Trash2 } from "lucide-react";

interface Role {
    id: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
    permissions: string[];
}

const AVAILABLE_PERMISSIONS: { key: string; label: string }[] = [
    { key: "manage_users", label: "Gestionar usuarios" },
    { key: "manage_roles", label: "Gestionar roles y permisos" },
    { key: "manage_plugins", label: "Gestionar plugins e integraciones" },
    { key: "view_activity", label: "Ver auditoría y actividad" },
];

export default function RolesSettingsPage() {
    const { user } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDescription, setNewRoleDescription] = useState("");
    const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.IAM.ROLES, { withCredentials: true });
                setRoles(res.data);
            } catch (err) {
                console.error("Failed to load roles", err);
            } finally {
                setLoading(false);
            }
        };
        fetchRoles();
    }, []);

    const togglePermissionInNewRole = (key: string) => {
        setNewRolePermissions((prev) =>
            prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
        );
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;
        setCreating(true);
        try {
            const res = await axios.post(
                API_ENDPOINTS.IAM.ROLES,
                {
                    name: newRoleName.trim(),
                    description: newRoleDescription.trim() || undefined,
                    permissions: newRolePermissions,
                },
                { withCredentials: true },
            );
            setRoles((prev) => [...prev, res.data]);
            setNewRoleName("");
            setNewRoleDescription("");
            setNewRolePermissions([]);
        } catch (err) {
            console.error("Failed to create role", err);
        } finally {
            setCreating(false);
        }
    };

    const handleTogglePermission = async (role: Role, key: string) => {
        const updatedPermissions = role.permissions.includes(key)
            ? role.permissions.filter((p) => p !== key)
            : [...role.permissions, key];
        try {
            await axios.patch(
                `${API_ENDPOINTS.IAM.ROLES}/${role.id}`,
                { permissions: updatedPermissions },
                { withCredentials: true },
            );
            setRoles((prev) =>
                prev.map((r) =>
                    r.id === role.id ? { ...r, permissions: updatedPermissions } : r,
                ),
            );
        } catch (err) {
            console.error("Failed to update role permissions", err);
        }
    };

    const handleDeleteRole = async (roleId: string) => {
        try {
            await axios.delete(`${API_ENDPOINTS.IAM.ROLES}/${roleId}`, {
                withCredentials: true,
            });
            setRoles((prev) => prev.filter((r) => r.id !== roleId));
        } catch (err) {
            console.error("Failed to delete role", err);
        }
    };

    const canManageRoles =
        !!user &&
        (user.isAdmin || user.permissions?.includes("manage_roles"));

    if (!canManageRoles) {
        return (
            <div className="min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No tienes permisos para gestionar roles y permisos.
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Roles y permisos</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Define qué puede hacer cada tipo de usuario dentro de tu Cloud.
                </p>
            </div>

            {/* Crear rol */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Nuevo rol</h2>
                        <p className="text-xs text-muted-foreground">
                            Crea roles personalizados con permisos específicos.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <Input
                        placeholder="Nombre del rol (por ejemplo, Soporte, Finanzas...)"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                    />
                    <Input
                        placeholder="Descripción (opcional)"
                        value={newRoleDescription}
                        onChange={(e) => setNewRoleDescription(e.target.value)}
                    />
                    <div className="space-y-1">
                        <div className="text-xs font-semibold text-muted-foreground uppercase">
                            Permisos
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_PERMISSIONS.map((perm) => {
                                const active = newRolePermissions.includes(perm.key);
                                return (
                                    <button
                                        key={perm.key}
                                        type="button"
                                        onClick={() => togglePermissionInNewRole(perm.key)}
                                        className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${active
                                                ? "bg-primary/10 text-primary border-primary/50"
                                                : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/40"
                                            }`}
                                    >
                                        {perm.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <Button
                        onClick={handleCreateRole}
                        disabled={!newRoleName.trim() || creating}
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creando rol...
                            </>
                        ) : (
                            <>
                                <Shield className="w-4 h-4 mr-2" />
                                Crear rol
                            </>
                        )}
                    </Button>
                </div>
            </motion.div>

            {/* Lista de roles */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Roles existentes</h2>
                        <p className="text-xs text-muted-foreground">
                            Activa o desactiva permisos por rol. Los roles de sistema no se pueden eliminar.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cargando roles...
                    </div>
                ) : roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Todavía no hay roles definidos.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {roles.map((role) => (
                            <div
                                key={role.id}
                                className="border border-border/50 rounded-xl px-4 py-3 flex flex-col gap-2"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">
                                                {role.name}
                                            </span>
                                            {role.isSystem && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                                                    Sistema
                                                </span>
                                            )}
                                        </div>
                                        {role.description && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {role.description}
                                            </p>
                                        )}
                                    </div>
                                    {!role.isSystem && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDeleteRole(role.id)}
                                        >
                                            <Trash2 className="w-3 h-3 mr-1.5" />
                                            Eliminar
                                        </Button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {AVAILABLE_PERMISSIONS.map((perm) => {
                                        const active = role.permissions.includes(perm.key);
                                        return (
                                            <button
                                                key={perm.key}
                                                type="button"
                                                disabled={role.isSystem}
                                                onClick={() => handleTogglePermission(role, perm.key)}
                                                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${active
                                                        ? "bg-primary/10 text-primary border-primary/50"
                                                        : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/40"
                                                    } ${role.isSystem ? "opacity-60 cursor-not-allowed" : ""}`}
                                            >
                                                {perm.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

