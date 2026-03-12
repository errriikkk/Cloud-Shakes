"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader2, Lock, User } from "lucide-react";

interface InviteAcceptPageProps {
    params: { token: string };
}

export default function InviteAcceptPage({ params }: InviteAcceptPageProps) {
    const router = useRouter();
    const { token } = params;
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!username || !displayName || !password || !confirmPassword) {
            setError("Rellena todos los campos.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        setLoading(true);
        try {
            await axios.post(API_ENDPOINTS.IAM.ACCEPT_INVITATION, {
                token,
                username,
                password,
                displayName,
            });
            setSuccess(true);
            setTimeout(() => {
                router.push("/");
            }, 2000);
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                "No se ha podido aceptar la invitación. Es posible que haya expirado.",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-sm p-6 space-y-4">
                <div className="text-center space-y-1">
                    <h1 className="text-2xl font-extrabold tracking-tight">
                        Aceptar invitación
                    </h1>
                    <p className="text-xs text-muted-foreground">
                        Completa tu cuenta para acceder al espacio compartido.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                            Nombre de usuario
                        </label>
                        <Input
                            placeholder="tu_usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                            Nombre a mostrar
                        </label>
                        <Input
                            placeholder="Tu nombre"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                            Contraseña
                        </label>
                        <Input
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                            Repite la contraseña
                        </label>
                        <Input
                            type="password"
                            placeholder="Repite la contraseña"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                            Cuenta creada correctamente. Redirigiendo...
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full mt-1"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creando cuenta...
                            </>
                        ) : (
                            <>
                                <User className="w-4 h-4 mr-2" />
                                Crear cuenta
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-[11px] text-muted-foreground text-center mt-2">
                    Si el enlace ha caducado, pide a la persona administradora que te envíe una nueva invitación.
                </p>
            </div>
        </div>
    );
}

