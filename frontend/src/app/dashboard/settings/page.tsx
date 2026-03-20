"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Settings, User, Lock, Camera, Save, X, Loader2, Globe, Shield, Users, Database, ServerCog, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { useModal } from "@/hooks/useModal";
import { cn } from "@/lib/utils";
import { useTranslation, Locale } from "@/lib/i18n";
import { BuiltWithBadge } from "@/components/BuiltWithBadge";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { Modal, ModalFooter } from "@/components/ui/Modal";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function SettingsPage() {
    const { user, loading: authLoading } = useAuth();
    const { alert, ModalComponents } = useModal();
    const { t, locale, setLocale } = useTranslation();
    const canManageSettings = !!(user?.isAdmin || user?.permissions?.includes('manage_settings'));
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
    const [avatarCropOpen, setAvatarCropOpen] = useState(false);
    const [profile, setProfile] = useState({
        displayName: "",
        avatarUrl: null as string | null,
    });
    const [password, setPassword] = useState({
        current: "",
        new: "",
        confirm: "",
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Backup configuration
    const canManageBackups = !!(user?.isAdmin || user?.permissions?.includes('manage_backups'));
    const [backupType, setBackupType] = useState<'local' | 's3' | 'ssh'>('local');
    const [backupLoading, setBackupLoading] = useState(false);
    const [backupTriggerLoading, setBackupTriggerLoading] = useState(false);
    const [backupConfigs, setBackupConfigs] = useState<any[]>([]);
    const [backupApiAvailable, setBackupApiAvailable] = useState<boolean | null>(null);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreConfirmText, setRestoreConfirmText] = useState("");
    const [backupForm, setBackupForm] = useState({
        name: 'Default Backup',
        localPath: '/backups',
        s3Endpoint: '',
        s3Bucket: '',
        s3AccessKey: '',
        s3SecretKey: '',
        s3Region: 'us-east-1',
        sshHost: '',
        sshUser: '',
        sshPath: '/backups',
        sshPassword: '',
        schedule: '',
        retention: 7,
    });

    const fetchBackupConfigs = useCallback(async () => {
        if (!canManageBackups) return;
        try {
            const res = await axios.get(`${API_BASE}/api/backups`, { withCredentials: true });
            setBackupApiAvailable(true);
            setBackupConfigs(res.data || []);
            if (res.data?.length > 0) {
                const first = res.data[0];
                setBackupType(first.type || 'local');
                setBackupForm(f => ({
                    ...f,
                    name: first.name || 'Default Backup',
                    localPath: first.localPath || '/backups',
                    s3Endpoint: first.s3Endpoint || '',
                    s3Bucket: first.s3Bucket || '',
                    s3Region: first.s3Region || 'us-east-1',
                    sshHost: first.sshHost || '',
                    sshUser: first.sshUser || '',
                    sshPath: first.sshPath || '/backups',
                    schedule: first.schedule || '',
                    retention: first.retention || 7,
                }));
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                setBackupApiAvailable(false); // Route not deployed yet
            }
            // Silently ignore other errors
        }
    }, [canManageBackups]);

    const saveBackupConfig = async () => {
        if (!canManageBackups) return;
        setBackupLoading(true);
        try {
            const id = backupConfigs?.[0]?.id;
            await axios.post(`${API_BASE}/api/backups`, {
                id, type: backupType, ...backupForm
            }, { withCredentials: true });
            alert('Success', 'Backup configuration saved.', { type: 'success' });
            fetchBackupConfigs();
        } catch (err: any) {
            alert('Error', err.response?.data?.message || err.message, { type: 'danger' });
        } finally {
            setBackupLoading(false);
        }
    };

    const triggerBackup = async (configId: string) => {
        setBackupTriggerLoading(true);
        try {
            await axios.post(`${API_BASE}/api/backups/trigger`, { configId }, { withCredentials: true });
            alert('Success', 'Backup started in background.', { type: 'success' });
            // Refresh to see the pending record
            setTimeout(fetchBackupConfigs, 1000);
        } catch (err: any) {
            alert('Error', err.response?.data?.message || err.message, { type: 'danger' });
        } finally {
            setBackupTriggerLoading(false);
        }
    };

    const restoreBackup = async (backupId: string, confirm: boolean = false) => {
        if (!confirm) {
            setRestoringId(backupId);
            setRestoreConfirmText("");
            return;
        }

        if (restoreConfirmText !== "RESTORE") {
            alert('Error', 'Please type RESTORE to confirm.', { type: 'danger' });
            return;
        }

        setRestoreLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/backups/${backupId}/restore`, { confirm: true }, { withCredentials: true });
            alert('Success', 'System restored successfully. The server may restart.', { type: 'success' });
            setRestoringId(null);
        } catch (err: any) {
            alert('Error', err.response?.data?.message || err.message, { type: 'danger' });
        } finally {
            setRestoreLoading(false);
        }
    };

    // Cloud limits (global)
    const [cloudLimitsLoading, setCloudLimitsLoading] = useState(false);
    const [cloudStorageUnlimited, setCloudStorageUnlimited] = useState(true);
    const [cloudStorageGB, setCloudStorageGB] = useState("50");
    const [cloudUploadSpeedUnlimited, setCloudUploadSpeedUnlimited] = useState(false);
    const [cloudUploadSpeedMB, setCloudUploadSpeedMB] = useState("10");

    const fetchCloudLimits = useCallback(async () => {
        if (!canManageSettings) return;
        setCloudLimitsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/cloud-settings`, { withCredentials: true });
            const storageLimitBytes = res.data?.storageLimitBytes;
            const maxUploadSpeedKB = res.data?.maxUploadSpeedKB;

            if (storageLimitBytes === null) {
                setCloudStorageUnlimited(true);
            } else if (storageLimitBytes) {
                setCloudStorageUnlimited(false);
                const gb = Math.max(1, Math.round(Number(storageLimitBytes) / 1024 / 1024 / 1024));
                setCloudStorageGB(String(gb));
            }

            if (maxUploadSpeedKB === null || maxUploadSpeedKB === undefined) {
                // null => env default
                setCloudUploadSpeedUnlimited(false);
                setCloudUploadSpeedMB("10");
            } else if (maxUploadSpeedKB === 0) {
                setCloudUploadSpeedUnlimited(true);
            } else {
                setCloudUploadSpeedUnlimited(false);
                setCloudUploadSpeedMB(String(Math.max(1, Math.round(Number(maxUploadSpeedKB) / 1024))));
            }
        } catch (err) {
            // ignore
        } finally {
            setCloudLimitsLoading(false);
        }
    }, [canManageSettings]);

    const saveCloudLimits = async () => {
        if (!canManageSettings) return;
        setCloudLimitsLoading(true);
        try {
            const payload: any = {};
            payload.storageLimitBytes = cloudStorageUnlimited
                ? null
                : String(Math.max(1, parseInt(cloudStorageGB || "1", 10)) * 1024 * 1024 * 1024);

            payload.maxUploadSpeedKB = cloudUploadSpeedUnlimited
                ? 0
                : Math.max(1, parseInt(cloudUploadSpeedMB || "1", 10)) * 1024;

            await axios.put(`${API_BASE}/api/cloud-settings`, payload, { withCredentials: true });
            alert(t("common.success"), t("common.saved") || t("common.success"), { type: 'success' });
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("common.error"), { type: 'danger' });
        } finally {
            setCloudLimitsLoading(false);
        }
    };

    // Branding (name + logo)
    const [brandingLoading, setBrandingLoading] = useState(false);
    const [cloudName, setCloudName] = useState("");
    const [logoUrl, setLogoUrl] = useState("");

    const fetchBranding = useCallback(async () => {
        if (!canManageSettings) return;
        setBrandingLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/branding`, { withCredentials: true });
            setCloudName(res.data?.cloudName || "");
            setLogoUrl(res.data?.logoUrl || "");
        } catch {
            // ignore
        } finally {
            setBrandingLoading(false);
        }
    }, [canManageSettings]);

    const saveBranding = async () => {
        if (!canManageSettings) return;
        setBrandingLoading(true);
        try {
            await axios.put(`${API_BASE}/api/branding`, { cloudName, logoUrl }, { withCredentials: true });
            alert(t("common.success"), t("common.saved") || t("common.success"), { type: "success" });
            // Apply immediately
            window.location.reload();
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("common.error"), { type: "danger" });
        } finally {
            setBrandingLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            setProfile({
                displayName: user.displayName || "",
                avatarUrl: user.avatarUrl || null,
            });
        }
    }, [user]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert(t("common.error"), t("settings.onlyImages"), { type: 'danger' });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert(t("common.error"), t("settings.imageTooLarge"), { type: 'danger' });
            return;
        }

        // Crop before uploading (WhatsApp-like)
        setPendingAvatarFile(file);
        setAvatarCropOpen(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const uploadAvatarBlob = async (blob: Blob) => {
        setUploadingAvatar(true);
        const formData = new FormData();
        formData.append('file', new File([blob], "avatar.jpg", { type: "image/jpeg" }));

        try {
            const res = await axios.post(`${API_BASE}/api/profile/avatar`, formData, {
                withCredentials: true,
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setProfile(prev => ({ ...prev, avatarUrl: res.data.avatarUrl }));
            window.location.reload();
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("settings.uploadFailed"), { type: 'danger' });
        } finally {
            setUploadingAvatar(false);
            setPendingAvatarFile(null);
            setAvatarCropOpen(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!profile.displayName.trim()) {
            alert(t("common.error"), t("settings.nameEmpty"), { type: 'danger' });
            return;
        }
        setLoading(true);
        try {
            await axios.put(`${API_BASE}/api/profile`, { displayName: profile.displayName }, { withCredentials: true });
            alert(t("common.success"), t("settings.profileUpdated"), { type: 'success' });
            window.location.reload();
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("settings.updateFailed"), { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        setUploadingAvatar(true);
        try {
            await axios.delete(`${API_BASE}/api/profile/avatar`, { withCredentials: true });
            setProfile(prev => ({ ...prev, avatarUrl: null }));
            window.location.reload();
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("settings.updateFailed"), { type: 'danger' });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleChangePassword = async () => {
        if (!password.new || !password.confirm) {
            alert(t("common.error"), t("settings.allFieldsRequired"), { type: 'danger' });
            return;
        }
        if (password.new !== password.confirm) {
            alert(t("common.error"), t("settings.passwordsNoMatch"), { type: 'danger' });
            return;
        }
        if (password.new.length < 6) {
            alert(t("common.error"), t("settings.passwordTooShort"), { type: 'danger' });
            return;
        }
        setLoading(true);
        try {
            await axios.put(`${API_BASE}/api/profile`, { password: password.new }, { withCredentials: true });
            alert(t("common.success"), t("settings.passwordUpdated"), { type: 'success' });
            setPassword({ current: "", new: "", confirm: "" });
        } catch (err: any) {
            alert(t("common.error"), err.response?.data?.message || t("settings.passwordFailed"), { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCloudLimits();
    }, [fetchCloudLimits]);

    useEffect(() => {
        fetchCloudLimits();
    }, [fetchCloudLimits]);

    useEffect(() => {
        fetchBranding();
    }, [fetchBranding]);

    useEffect(() => {
        fetchBackupConfigs();
    }, [fetchBackupConfigs]);


    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <ModalComponents />
            <AvatarCropModal
                isOpen={avatarCropOpen}
                imageFile={pendingAvatarFile}
                onClose={() => {
                    setAvatarCropOpen(false);
                    setPendingAvatarFile(null);
                }}
                onCropped={(blob) => uploadAvatarBlob(blob)}
            />
            {/* Final badge/credits */}
            <div className="mt-12 mb-8">
                <BuiltWithBadge />
            </div>

            {/* Restore Confirmation Modal */}
            <Modal
                isOpen={!!restoringId}
                onClose={() => setRestoringId(null)}
                title="Confirmar Restauración"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0">
                            <RotateCcw className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-200 leading-tight">Acción Irreversible</p>
                            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-normal">
                                Restaurar una copia de seguridad reemplazará toda la base de datos actual. Asegúrate de haber guardado cambios importantes antes de proceder.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">Escribe <span className="text-foreground">RESTORE</span> para continuar</label>
                        <Input 
                            value={restoreConfirmText}
                            onChange={(e) => setRestoreConfirmText(e.target.value.toUpperCase())}
                            className="bg-muted/30 border-border/60 rounded-2xl p-4 font-mono text-center tracking-widest h-14 text-lg focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none"
                            placeholder="RESTORE"
                        />
                    </div>

                    <ModalFooter className="pt-2">
                        <Button variant="ghost" className="rounded-xl h-12 px-6 font-bold" onClick={() => setRestoringId(null)}>
                            Cancelar
                        </Button>
                        <Button 
                            className="rounded-xl px-10 h-12 font-bold shadow-lg shadow-primary/20" 
                            disabled={restoreConfirmText !== "RESTORE" || restoreLoading}
                            isLoading={restoreLoading}
                            onClick={() => restoringId && restoreBackup(restoringId, true)}
                        >
                            Restaurar Ahora
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            <div className="space-y-8">
                {/* Header */}
                <div className="pt-4">
                    <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                        {t("settings.title")}
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm font-medium">
                        {t("settings.subtitle")}
                    </p>
                </div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Globe className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{t("settings.language")}</h2>
                    </div>

                    <p className="text-xs text-muted-foreground mb-4">{t("settings.selectLanguage")}</p>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setLocale('es')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all",
                                locale === 'es'
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/60 text-muted-foreground hover:border-primary/30 hover:bg-muted/40"
                            )}
                        >
                            <span className="text-lg">🇪🇸</span>
                            Español
                        </button>
                        <button
                            onClick={() => setLocale('en')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all",
                                locale === 'en'
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/60 text-muted-foreground hover:border-primary/30 hover:bg-muted/40"
                            )}
                        >
                            <span className="text-lg">🇬🇧</span>
                            English
                        </button>
                    </div>
                </motion.div>

                {/* Profile Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{t("settings.profile")}</h2>
                    </div>

                    <div className="space-y-6">
                        {/* Avatar */}
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                {profile.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover border-2 border-border/60" />
                                ) : (
                                    <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center border-2 border-border/60">
                                        <User className="w-12 h-12 text-muted-foreground" />
                                    </div>
                                )}
                                {uploadingAvatar && (
                                    <div className="absolute inset-0 bg-background/80 rounded-2xl flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-foreground mb-2">{t("settings.profilePhoto")}</h3>
                                <p className="text-xs text-muted-foreground mb-3">{t("settings.profilePhotoDesc")}</p>
                                {/* NOTE: keep input "visible" to the browser (not display:none) so file picker can open reliably */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    className="absolute -left-[9999px] w-px h-px opacity-0"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="cursor-pointer"
                                    disabled={uploadingAvatar}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Camera className="w-4 h-4 mr-2" />
                                    {uploadingAvatar ? t("common.uploading") : t("settings.changePhoto")}
                                </Button>
                                {profile.avatarUrl && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="ml-2"
                                        disabled={uploadingAvatar}
                                        onClick={handleRemoveAvatar}
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        {t("common.delete") || "Delete"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Display Name */}
                        <div>
                            <label className="text-sm font-bold text-foreground block mb-2">{t("settings.displayName")}</label>
                            <Input
                                type="text"
                                value={profile.displayName}
                                onChange={(e) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
                                placeholder={t("settings.displayName")}
                                className="max-w-md"
                            />
                            <p className="text-xs text-muted-foreground mt-1">{t("settings.displayNameDesc")}</p>
                        </div>

                        <Button onClick={handleUpdateProfile} disabled={loading} className="w-full sm:w-auto">
                            {loading ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("common.saving")}</>
                            ) : (
                                <><Save className="w-4 h-4 mr-2" />{t("settings.saveChanges")}</>
                            )}
                        </Button>
                    </div>
                </motion.div>

                {/* Cloud Limits (Admin/Managers) */}
                {canManageSettings && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">Cloud limits</h2>
                        </div>

                        <div className="space-y-6">
                            {/* Storage */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Storage limit</p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setCloudStorageUnlimited(true)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl border font-bold text-sm transition-all",
                                            cloudStorageUnlimited ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        Unlimited
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCloudStorageUnlimited(false)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl border font-bold text-sm transition-all",
                                            !cloudStorageUnlimited ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        Fixed
                                    </button>
                                    {!cloudStorageUnlimited && (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={cloudStorageGB}
                                                onChange={(e) => setCloudStorageGB(e.target.value)}
                                                className="w-28 rounded-xl"
                                                min={1}
                                            />
                                            <span className="text-sm font-bold text-muted-foreground">GB</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Applies instantly to uploads and usage display.
                                </p>
                            </div>

                            {/* Upload speed */}
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Upload speed limit</p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setCloudUploadSpeedUnlimited(true)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl border font-bold text-sm transition-all",
                                            cloudUploadSpeedUnlimited ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        Unlimited
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCloudUploadSpeedUnlimited(false)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl border font-bold text-sm transition-all",
                                            !cloudUploadSpeedUnlimited ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        Limited
                                    </button>
                                    {!cloudUploadSpeedUnlimited && (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={cloudUploadSpeedMB}
                                                onChange={(e) => setCloudUploadSpeedMB(e.target.value)}
                                                className="w-28 rounded-xl"
                                                min={1}
                                            />
                                            <span className="text-sm font-bold text-muted-foreground">MB/s</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Uses throttling; set Unlimited to remove throttling.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={saveCloudLimits}
                                    className="rounded-xl"
                                    disabled={cloudLimitsLoading}
                                    isLoading={cloudLimitsLoading}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={fetchCloudLimits}
                                    className="rounded-xl"
                                    disabled={cloudLimitsLoading}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Branding */}
                {canManageSettings && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Camera className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">Branding</h2>
                        </div>

                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground">Cloud name</label>
                                    <Input
                                        value={cloudName}
                                        onChange={(e) => setCloudName(e.target.value)}
                                        placeholder="Your Cloud name"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground">Logo URL</label>
                                    <Input
                                        value={logoUrl}
                                        onChange={(e) => setLogoUrl(e.target.value)}
                                        placeholder="https://..."
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl border border-border/60 bg-muted/30 overflow-hidden flex items-center justify-center">
                                    <img
                                        src={logoUrl || "/logo-512.png"}
                                        alt="logo preview"
                                        className="w-full h-full object-cover"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo-512.png"; }}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate">{cloudName || "Cloud Shakes"}</p>
                                    <p className="text-xs text-muted-foreground">Built with Cloud Shakes (always shown) + GitHub link.</p>
                                </div>
                            </div>

                            <BuiltWithBadge />

                            <div className="flex items-center gap-3">
                                <Button onClick={saveBranding} className="rounded-xl" isLoading={brandingLoading} disabled={brandingLoading}>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </Button>
                                <Button variant="ghost" onClick={fetchBranding} className="rounded-xl" disabled={brandingLoading}>
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Backup Section - Admin only, visible once API confirms route exists */}
                {canManageBackups && backupApiAvailable === true && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Database className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Backup System</h2>
                                <p className="text-xs text-muted-foreground">Configure automated backups. Credentials are encrypted at rest (AES-256-GCM).</p>
                            </div>
                        </div>

                        {/* Type selector */}
                        <div className="flex gap-2 mb-6">
                            {(['local', 's3', 'ssh'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setBackupType(type)}
                                    className={cn(
                                        "flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs uppercase tracking-wider transition-all",
                                        backupType === type
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border/60 text-muted-foreground hover:border-primary/30"
                                    )}
                                >
                                    {type === 's3' ? 'S3 / MinIO' : type}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground">Config Name</label>
                                    <Input value={backupForm.name} onChange={e => setBackupForm(f => ({...f, name: e.target.value}))} className="rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground">Retention (days)</label>
                                    <Input type="number" value={backupForm.retention} onChange={e => setBackupForm(f => ({...f, retention: Number(e.target.value)}))} className="rounded-xl" min={1} />
                                </div>
                            </div>

                            {backupType === 'local' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground">Local Path</label>
                                    <Input placeholder="/backups" value={backupForm.localPath} onChange={e => setBackupForm(f => ({...f, localPath: e.target.value}))} className="rounded-xl" />
                                    <p className="text-xs text-muted-foreground">Absolute path on the server where backup files will be stored.</p>
                                </div>
                            )}

                            {backupType === 's3' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Endpoint (MinIO / S3)</label>
                                            <Input placeholder="http://minio:9000" value={backupForm.s3Endpoint} onChange={e => setBackupForm(f => ({...f, s3Endpoint: e.target.value}))} className="rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Bucket</label>
                                            <Input placeholder="my-backups" value={backupForm.s3Bucket} onChange={e => setBackupForm(f => ({...f, s3Bucket: e.target.value}))} className="rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Access Key</label>
                                            <Input type="password" placeholder="Leave blank to keep existing" value={backupForm.s3AccessKey} onChange={e => setBackupForm(f => ({...f, s3AccessKey: e.target.value}))} className="rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Secret Key</label>
                                            <Input type="password" placeholder="Leave blank to keep existing" value={backupForm.s3SecretKey} onChange={e => setBackupForm(f => ({...f, s3SecretKey: e.target.value}))} className="rounded-xl" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Compatible with MinIO, AWS S3, Backblaze B2, and any S3-compatible provider.</p>
                                </div>
                            )}

                            {backupType === 'ssh' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">SSH Host</label>
                                            <Input placeholder="backup.example.com" value={backupForm.sshHost} onChange={e => setBackupForm(f => ({...f, sshHost: e.target.value}))} className="rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">SSH User</label>
                                            <Input placeholder="backup-user" value={backupForm.sshUser} onChange={e => setBackupForm(f => ({...f, sshUser: e.target.value}))} className="rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Remote Path</label>
                                            <Input placeholder="/home/backup-user/backups" value={backupForm.sshPath} onChange={e => setBackupForm(f => ({...f, sshPath: e.target.value}))} className="rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Password <span className="text-muted-foreground font-normal">(or leave blank if using key)</span></label>
                                            <Input type="password" placeholder="Leave blank to keep existing" value={backupForm.sshPassword} onChange={e => setBackupForm(f => ({...f, sshPassword: e.target.value}))} className="rounded-xl" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠ SSH host fingerprint is validated to prevent MITM attacks. Credentials encrypted with AES-256-GCM.</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">Schedule (cron, optional)</label>
                                <Input placeholder="0 3 * * * (every day at 3am)" value={backupForm.schedule} onChange={e => setBackupForm(f => ({...f, schedule: e.target.value}))} className="rounded-xl font-mono" />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <Button onClick={saveBackupConfig} className="rounded-xl" disabled={backupLoading} isLoading={backupLoading}>
                                    <Save className="w-4 h-4 mr-2" />Save Configuration
                                </Button>
                                {backupConfigs?.[0]?.id && (
                                    <Button variant="outline" onClick={() => triggerBackup(backupConfigs[0].id)} className="rounded-xl" disabled={backupTriggerLoading} isLoading={backupTriggerLoading}>
                                        <RotateCcw className="w-4 h-4 mr-2" />Trigger Backup Now
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Recent Backups */}
                        {backupConfigs?.[0]?.backups?.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><ServerCog className="w-4 h-4" /> Recent Backups</h3>
                                <div className="space-y-2">
                                    {backupConfigs[0].backups.slice(0, 5).map((b: any) => (
                                        <div key={b.id} className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-xl border border-border/40 text-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-2 h-2 rounded-full",
                                                    b.status === 'success' ? 'bg-green-500' :
                                                    b.status === 'failed' ? 'bg-red-500' : 'bg-yellow-400'
                                                )} />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{b.filename || 'Unnamed'}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{new Date(b.startedAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={() => restoreBackup(b.id)}
                                                    className="h-8 px-3 rounded-lg text-primary hover:bg-primary/10 text-xs font-bold"
                                                    disabled={b.status !== 'success'}
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                                    Restaurar
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Password Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{t("settings.security")}</h2>
                    </div>

                    <div className="space-y-4 max-w-md">
                        <div>
                            <label className="text-sm font-bold text-foreground block mb-2">{t("settings.newPassword")}</label>
                            <Input
                                type="password"
                                value={password.new}
                                onChange={(e) => setPassword(prev => ({ ...prev, new: e.target.value }))}
                                placeholder={t("settings.minChars")}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-foreground block mb-2">{t("settings.confirmPassword")}</label>
                            <Input
                                type="password"
                                value={password.confirm}
                                onChange={(e) => setPassword(prev => ({ ...prev, confirm: e.target.value }))}
                                placeholder={t("settings.repeatPassword")}
                            />
                        </div>
                        <Button onClick={handleChangePassword} disabled={loading || !password.new || !password.confirm} variant="outline" className="w-full sm:w-auto">
                            {loading ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("settings.changing")}</>
                            ) : (
                                <><Lock className="w-4 h-4 mr-2" />{t("settings.changePassword")}</>
                            )}
                        </Button>
                    </div>
                </motion.div>

                {/* Team Section - Only for admins */}
                {user && user.isAdmin && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Users className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">{t("settings.team") || "Team"}</h2>
                        </div>

                        <p className="text-xs text-muted-foreground mb-6">{t("settings.teamDesc") || "Manage team members and their access"}</p>

                        <Link
                            href="/dashboard/settings/team"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all"
                        >
                            <Users className="w-4 h-4" />
                            {t("settings.manageTeam") || "Manage Team"}
                        </Link>
                    </motion.div>
                )}

                {/* Footer or additional content */}
            </div>
        </>
    );
}
