"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Settings, User, Lock, Camera, Save, X, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { useModal } from "@/hooks/useModal";
import { cn } from "@/lib/utils";
import { useTranslation, Locale } from "@/lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function SettingsPage() {
    const { user, loading: authLoading } = useAuth();
    const { alert, ModalComponents } = useModal();
    const { t, locale, setLocale } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
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

        setUploadingAvatar(true);
        const formData = new FormData();
        formData.append('file', file);

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
            if (fileInputRef.current) fileInputRef.current.value = '';
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
            <div className="space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                        {t("settings.title")}
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm font-medium">
                        {t("settings.subtitle")}
                    </p>
                </div>

                {/* Language Section */}
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
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" id="avatar-upload" />
                                <label htmlFor="avatar-upload">
                                    <Button variant="outline" className="cursor-pointer" disabled={uploadingAvatar}>
                                        <Camera className="w-4 h-4 mr-2" />
                                        {uploadingAvatar ? t("common.uploading") : t("settings.changePhoto")}
                                    </Button>
                                </label>
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
            </div>
        </>
    );
}
