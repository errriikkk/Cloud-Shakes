"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Lock, Clock, Zap, Copy, Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";

interface CreateLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileId: string;
    onSuccess: (linkUrl: string) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function CreateLinkModal({ isOpen, onClose, fileId, onSuccess }: CreateLinkModalProps) {
    const { t } = useTranslation();
    const [password, setPassword] = useState("");
    const [expiryMinutes, setExpiryMinutes] = useState("");
    const [directDownload, setDirectDownload] = useState(false);
    const [isEmbed, setIsEmbed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [existingLoading, setExistingLoading] = useState(false);
    const [existingLinks, setExistingLinks] = useState<any[]>([]);
    const [showCreateNew, setShowCreateNew] = useState(false);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const shareUrlFor = (id: string) => `${origin}/s/${id}`;
    const embedUrlFor = (id: string) => `${origin}/api/links/${id}/raw`;

    const loadExisting = async () => {
        try {
            setExistingLoading(true);
            const res = await axios.get(`${API}/api/links`, { withCredentials: true });
            const all = Array.isArray(res.data) ? res.data : [];
            const matches = all.filter((l: any) => l.fileId === fileId);
            // newest first
            matches.sort((a: any, b: any) => {
                const at = new Date(a.createdAt || 0).getTime();
                const bt = new Date(b.createdAt || 0).getTime();
                return bt - at;
            });
            setExistingLinks(matches);
        } catch (e) {
            console.error("Failed to load existing links", e);
            setExistingLinks([]);
        } finally {
            setExistingLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setShowCreateNew(false);
        setPassword("");
        setExpiryMinutes("");
        setDirectDownload(false);
        setIsEmbed(false);
        loadExisting();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, fileId]);

    const hasExisting = existingLinks.length > 0;

    const copyToClipboard = async (text: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
            }
        } catch (e) {
            console.error("Copy failed", e);
        }
    };

    const handleUseExisting = async (link: any) => {
        const url = link.isEmbed ? embedUrlFor(link.id) : shareUrlFor(link.id);
        await copyToClipboard(url);
        onSuccess(url);
    };

    const handleRevoke = async (id: string) => {
        try {
            await axios.delete(`${API}/api/links/${id}`, { withCredentials: true });
            setExistingLinks(prev => prev.filter(l => l.id !== id));
        } catch (e) {
            console.error("Failed to revoke link", e);
        }
    };

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
            // refresh list so user doesn't create duplicates blindly next time
            loadExisting();
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
        <Modal isOpen={isOpen} onClose={onClose} title={t("share.modal.title")}>
            <div className="space-y-6 py-2">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    {t("share.modal.subtitle")}
                </p>

                {/* Existing links */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                                {t("share.modal.existingTitle")}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-medium">
                                {t("share.modal.existingHelp")}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={loadExisting}
                            className="text-xs font-bold text-primary hover:underline"
                        >
                            {existingLoading ? "..." : t("common.refresh")}
                        </button>
                    </div>

                    {existingLoading ? (
                        <div className="p-4 rounded-2xl border border-border/60 bg-muted/30 text-xs text-muted-foreground">
                            {t("share.modal.loadingExisting")}
                        </div>
                    ) : !hasExisting ? (
                        <div className="p-4 rounded-2xl border border-border/60 bg-muted/30 text-xs text-muted-foreground">
                            {t("share.modal.noExisting")}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {existingLinks.slice(0, 5).map((l: any) => (
                                <div
                                    key={l.id}
                                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-background"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-foreground truncate">
                                            /{l.id}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-bold text-muted-foreground">
                                            {l.isEmbed && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{t("share.modal.embed")}</span>}
                                            {l.directDownload && <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600">{t("share.modal.direct")}</span>}
                                            {l.isPasswordProtected && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t("share.badge.password")}</span>}
                                            {l.expiresAt && <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">{t("share.modal.expiry")}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(l.isEmbed ? embedUrlFor(l.id) : shareUrlFor(l.id))}
                                            className="p-2 rounded-xl bg-muted/40 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                            title={t("share.modal.copy")}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleUseExisting(l)}
                                            className="px-3 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:brightness-110 transition-all"
                                        >
                                            {t("share.modal.use")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleRevoke(l.id)}
                                            className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 font-bold text-xs hover:bg-red-500/15 transition-colors"
                                        >
                                            {t("share.modal.revoke")}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {existingLinks.length > 5 && (
                                <p className="text-[11px] text-muted-foreground">
                                    {t("share.modal.showingSome").replace("{count}", String(existingLinks.length))}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Create new link */}
                <div className="space-y-4">
                    <button
                        type="button"
                        onClick={() => setShowCreateNew(v => !v)}
                        className={cn(
                            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
                            showCreateNew ? "bg-primary/5 border-primary/30" : "bg-muted/40 border-border/60 hover:border-border"
                        )}
                    >
                        <div className="text-left">
                            <p className="text-sm font-bold text-foreground">
                                {t("share.modal.createNewTitle")}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-medium">
                                {t("share.modal.createNewHelp")}
                            </p>
                        </div>
                        <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            showCreateNew ? "bg-primary border-primary" : "border-border/60"
                        )}>
                            {showCreateNew && <Check className="w-4 h-4 text-white" />}
                        </div>
                    </button>

                    {!showCreateNew && hasExisting && (
                        <div className="p-4 rounded-2xl border border-border/60 bg-muted/30 text-xs text-muted-foreground">
                            {t("share.modal.tipReuse")}
                        </div>
                    )}

                    {showCreateNew && (
                        <>
                    {/* Security & Expiry (Hidden if Embed is on) */}
                    {!isEmbed && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <Lock className="w-3 h-3" /> {t("share.modal.passwordLabel")}
                                    </label>
                                    <Input
                                        type="password"
                                        placeholder={t("share.modal.passwordPlaceholder")}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <Clock className="w-3 h-3" /> {t("share.modal.expiryLabel")}
                                    </label>
                                    <Input
                                        type="number"
                                        placeholder={t("share.modal.expiryPlaceholder")}
                                        value={expiryMinutes}
                                        onChange={(e) => setExpiryMinutes(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>
                            {/* Quick expiry presets */}
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className="text-muted-foreground/80 font-semibold">
                                    {t("share.modal.quick")}
                                </span>
                                {[
                                    { label: t("share.modal.presets.15m"), value: "15" },
                                    { label: t("share.modal.presets.1h"), value: "60" },
                                    { label: t("share.modal.presets.24h"), value: "1440" },
                                ].map(preset => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => setExpiryMinutes(preset.value)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors",
                                            expiryMinutes === preset.value
                                                ? "bg-primary text-white border-primary"
                                                : "border-border/60 text-muted-foreground hover:bg-muted/60"
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setExpiryMinutes("")}
                                    className={cn(
                                        "px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors",
                                        !expiryMinutes
                                            ? "bg-muted/80 text-foreground border-border/80"
                                            : "border-border/60 text-muted-foreground hover:bg-muted/60"
                                    )}
                                >
                                    {t("share.modal.never")}
                                </button>
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
                                    <p className="text-sm font-bold text-foreground">{t("share.modal.directTitle")}</p>
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                        {t("share.modal.directHelp")}
                                    </p>
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
                                    <p className="text-sm font-bold text-foreground">{t("share.modal.embedTitle")}</p>
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                        {t("share.modal.embedHelp")}
                                    </p>
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
                        </>
                    )}
                </div>

                <ModalFooter>
                    <Button variant="ghost" className="rounded-xl" onClick={onClose}>{t("common.cancel")}</Button>
                    <Button
                        className="rounded-xl px-8"
                        onClick={handleCreate}
                        disabled={loading || (!showCreateNew && hasExisting)}
                    >
                        {loading ? t("share.modal.creating") : t("share.modal.create")}
                    </Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}
