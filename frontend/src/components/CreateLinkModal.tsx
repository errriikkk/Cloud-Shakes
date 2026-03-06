"use client";

import { useState } from "react";
import { Modal, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Lock, Clock, Zap, Copy, Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";

interface CreateLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileId: string;
    onSuccess: (linkUrl: string) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function CreateLinkModal({ isOpen, onClose, fileId, onSuccess }: CreateLinkModalProps) {
    const [password, setPassword] = useState("");
    const [expiryMinutes, setExpiryMinutes] = useState("");
    const [directDownload, setDirectDownload] = useState(false);
    const [isEmbed, setIsEmbed] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        try {
            setLoading(true);
            const res = await axios.post(`${API}/api/links`, {
                fileId,
                password: isEmbed ? undefined : (password || undefined),
                expiresInMinutes: isEmbed ? undefined : (expiryMinutes ? parseInt(expiryMinutes) : undefined),
                directDownload: isEmbed ? false : directDownload,
                isEmbed
            }, { withCredentials: true });

            const linkUrl = isEmbed
                ? `${window.location.origin}/api/links/${res.data.id}/raw`
                : `${window.location.origin}/s/${res.data.id}`;
            onSuccess(linkUrl);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleEmbed = () => {
        setIsEmbed(!isEmbed);
        if (!isEmbed) setDirectDownload(false);
    };

    const toggleDirect = () => {
        setDirectDownload(!directDownload);
        if (!directDownload) setIsEmbed(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Compartir Archivo">
            <div className="space-y-6 py-2">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    Configura tu enlace para compartir con seguridad y expiración opcional.
                </p>

                <div className="space-y-4">
                    {/* Security & Expiry (Hidden if Embed is on) */}
                    {!isEmbed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                    <Lock className="w-3 h-3" /> Contraseña
                                </label>
                                <Input
                                    type="password"
                                    placeholder="Opcional..."
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Expiración (Mins)
                                </label>
                                <Input
                                    type="number"
                                    placeholder="Nunca..."
                                    value={expiryMinutes}
                                    onChange={(e) => setExpiryMinutes(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                        {/* Direct Download */}
                        <button
                            onClick={toggleDirect}
                            className={cn(
                                "w-full flex items-center justify-between p-4 rounded-2xl border transition-all group",
                                directDownload
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-muted/40 border-border/60 hover:border-border"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                    directDownload ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                )}>
                                    <Zap className={cn("w-5 h-5", directDownload && "fill-current")} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground">Descarga Directa</p>
                                    <p className="text-[11px] text-muted-foreground font-medium">Salta la previsualización</p>
                                </div>
                            </div>
                            <div className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                directDownload ? "bg-primary border-primary" : "border-border/60"
                            )}>
                                {directDownload && <Check className="w-4 h-4 text-white" />}
                            </div>
                        </button>

                        {/* Embed Option */}
                        <button
                            onClick={toggleEmbed}
                            className={cn(
                                "w-full flex items-center justify-between p-4 rounded-2xl border transition-all group",
                                isEmbed
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-muted/40 border-border/60 hover:border-border"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                    isEmbed ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                )}>
                                    <Globe className={cn("w-5 h-5", isEmbed && "fill-current")} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground">URL de Incrustación (Embed)</p>
                                    <p className="text-[11px] text-muted-foreground font-medium">Para iframes y uso externo</p>
                                </div>
                            </div>
                            <div className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                isEmbed ? "bg-primary border-primary" : "border-border/60"
                            )}>
                                {isEmbed && <Check className="w-4 h-4 text-white" />}
                            </div>
                        </button>
                    </div>
                </div>

                <ModalFooter>
                    <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancelar</Button>
                    <Button
                        className="rounded-xl px-8"
                        onClick={handleCreate}
                        disabled={loading}
                    >
                        {loading ? "Creando..." : "Generar Enlace"}
                    </Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}
