"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    Clock3,
    Database,
    HardDriveDownload,
    RefreshCcw,
    Save,
    ServerCog,
    ShieldAlert,
    TerminalSquare
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type BackupType = "local" | "s3" | "ssh";

export default function BackupControlCenterPage() {
    const { user } = useAuth();
    const canManageBackups = !!(user?.isAdmin || user?.permissions?.includes("manage_backups"));
    const [backupType, setBackupType] = useState<BackupType>("local");
    const [backupConfigs, setBackupConfigs] = useState<any[]>([]);
    const [backupLoading, setBackupLoading] = useState(false);
    const [backupTriggerLoading, setBackupTriggerLoading] = useState(false);
    const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreConfirmText, setRestoreConfirmText] = useState("");
    const [restorePreview, setRestorePreview] = useState<{ message?: string; affected?: string; warnings?: string[] } | null>(null);
    const [restoreCompare, setRestoreCompare] = useState<any | null>(null);

    const [backupForm, setBackupForm] = useState({
        name: "Default Backup",
        localPath: "/backups",
        s3Endpoint: "",
        s3Bucket: "",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Region: "us-east-1",
        sshHost: "",
        sshUser: "",
        sshPath: "/backups",
        sshPassword: "",
        schedule: "",
        retention: 7
    });

    const activeConfig = useMemo(
        () => backupConfigs.find((cfg) => cfg.id === activeConfigId) ?? backupConfigs[0] ?? null,
        [backupConfigs, activeConfigId]
    );

    const activeBackups = activeConfig?.backups ?? [];
    const lastSuccess = activeBackups.find((b: any) => b.status === "success");
    const lastFailed = activeBackups.find((b: any) => b.status === "failed");
    const runningCount = activeBackups.filter((b: any) => b.status === "in_progress").length;

    const hydrateFormFromConfig = useCallback((cfg: any) => {
        if (!cfg) return;
        setBackupType((cfg.type || "local") as BackupType);
        setBackupForm((f) => ({
            ...f,
            name: cfg.name || "Default Backup",
            localPath: cfg.localPath || "/backups",
            s3Endpoint: cfg.s3Endpoint || "",
            s3Bucket: cfg.s3Bucket || "",
            s3Region: cfg.s3Region || "us-east-1",
            sshHost: cfg.sshHost || "",
            sshUser: cfg.sshUser || "",
            sshPath: cfg.sshPath || "/backups",
            schedule: cfg.schedule || "",
            retention: cfg.retention || 7
        }));
    }, []);

    const fetchBackupConfigs = useCallback(async () => {
        if (!canManageBackups) return;
        try {
            const res = await axios.get(`${API_BASE}/api/backups`, { withCredentials: true });
            const configs = res.data || [];
            setBackupConfigs(configs);
            if (configs.length > 0) {
                const first = configs[0];
                setActiveConfigId((prev) => prev ?? first.id);
                hydrateFormFromConfig(first);
            }
        } catch (err) {
            console.error("Failed to load backup configs", err);
        }
    }, [canManageBackups, hydrateFormFromConfig]);

    useEffect(() => {
        fetchBackupConfigs();
    }, [fetchBackupConfigs]);

    const saveBackupConfig = async () => {
        setBackupLoading(true);
        try {
            const id = activeConfig?.id;
            await axios.post(
                `${API_BASE}/api/backups`,
                {
                    id,
                    type: backupType,
                    ...backupForm
                },
                { withCredentials: true }
            );
            await fetchBackupConfigs();
        } finally {
            setBackupLoading(false);
        }
    };

    const triggerBackup = async () => {
        if (!activeConfig?.id) return;
        setBackupTriggerLoading(true);
        try {
            await axios.post(`${API_BASE}/api/backups/trigger`, { configId: activeConfig.id }, { withCredentials: true });
            setTimeout(fetchBackupConfigs, 1000);
        } finally {
            setBackupTriggerLoading(false);
        }
    };

    const startRestoreFlow = async (backupId: string) => {
        setRestoringId(backupId);
        setRestoreLoading(true);
        setRestoreConfirmText("");
        setRestorePreview(null);
        setRestoreCompare(null);
        try {
            const [compareRes, previewRes] = await Promise.all([
                axios.get(`${API_BASE}/api/backups/${backupId}/compare`, { withCredentials: true }),
                axios.post(`${API_BASE}/api/backups/${backupId}/restore`, { confirm: false }, { withCredentials: true })
            ]);
            setRestoreCompare(compareRes.data);
            setRestorePreview({
                message: previewRes.data?.message,
                affected: previewRes.data?.affected,
                warnings: Array.isArray(previewRes.data?.warnings) ? previewRes.data.warnings : []
            });
        } catch (err: any) {
            setRestorePreview({
                message: err.response?.data?.message || "No se pudo cargar la previsualizacion de restore.",
                warnings: []
            });
        } finally {
            setRestoreLoading(false);
        }
    };

    const confirmRestore = async () => {
        if (!restoringId || restoreConfirmText !== "RESTORE") return;
        setRestoreLoading(true);
        try {
            await axios.post(`${API_BASE}/api/backups/${restoringId}/restore`, { confirm: true }, { withCredentials: true });
            setRestoringId(null);
            setRestoreConfirmText("");
            setRestorePreview(null);
            setRestoreCompare(null);
            await fetchBackupConfigs();
        } finally {
            setRestoreLoading(false);
        }
    };

    if (!canManageBackups) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="max-w-md text-center rounded-2xl border border-border bg-background p-8">
                    <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <h1 className="text-xl font-bold">Acceso restringido</h1>
                    <p className="text-sm text-muted-foreground mt-2">Necesitas el permiso `manage_backups` para gestionar backups.</p>
                    <Link href="/dashboard/settings" className="inline-flex mt-5 text-sm font-semibold text-primary hover:underline">
                        Volver a Settings
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/settings" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-muted/40">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Backup Control Center</h1>
                        <p className="text-sm text-muted-foreground">Panel operativo estilo Git: config, historial, restore y trazabilidad.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={fetchBackupConfigs}>
                        <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                    <Button className="rounded-xl" onClick={triggerBackup} isLoading={backupTriggerLoading} disabled={!activeConfig}>
                        <HardDriveDownload className="w-4 h-4 mr-2" /> Trigger Backup
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Last success</p>
                    <p className="mt-2 text-sm font-semibold">{lastSuccess ? new Date(lastSuccess.startedAt).toLocaleString() : "N/A"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Last failed</p>
                    <p className="mt-2 text-sm font-semibold">{lastFailed ? new Date(lastFailed.startedAt).toLocaleString() : "N/A"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Running jobs</p>
                    <p className="mt-2 text-sm font-semibold">{runningCount}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-2xl border border-border bg-background p-5 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> Configuracion activa</h2>
                        <div className="flex gap-2">
                            {(["local", "s3", "ssh"] as BackupType[]).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setBackupType(type)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border",
                                        backupType === type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                                    )}
                                >
                                    {type === "s3" ? "S3 / MinIO" : type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Config name</label>
                            <Input value={backupForm.name} onChange={(e) => setBackupForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Retention (days)</label>
                            <Input type="number" value={backupForm.retention} min={1} onChange={(e) => setBackupForm((f) => ({ ...f, retention: Number(e.target.value) }))} className="rounded-xl" />
                        </div>
                    </div>

                    {backupType === "local" && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Local path</label>
                            <Input value={backupForm.localPath} onChange={(e) => setBackupForm((f) => ({ ...f, localPath: e.target.value }))} className="rounded-xl" />
                        </div>
                    )}

                    {backupType === "s3" && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Endpoint</label>
                                    <Input value={backupForm.s3Endpoint} onChange={(e) => setBackupForm((f) => ({ ...f, s3Endpoint: e.target.value }))} className="rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bucket</label>
                                    <Input value={backupForm.s3Bucket} onChange={(e) => setBackupForm((f) => ({ ...f, s3Bucket: e.target.value }))} className="rounded-xl" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input type="password" placeholder="Access Key (opcional)" value={backupForm.s3AccessKey} onChange={(e) => setBackupForm((f) => ({ ...f, s3AccessKey: e.target.value }))} className="rounded-xl" />
                                <Input type="password" placeholder="Secret Key (opcional)" value={backupForm.s3SecretKey} onChange={(e) => setBackupForm((f) => ({ ...f, s3SecretKey: e.target.value }))} className="rounded-xl" />
                            </div>
                        </>
                    )}

                    {backupType === "ssh" && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input placeholder="SSH Host" value={backupForm.sshHost} onChange={(e) => setBackupForm((f) => ({ ...f, sshHost: e.target.value }))} className="rounded-xl" />
                                <Input placeholder="SSH User" value={backupForm.sshUser} onChange={(e) => setBackupForm((f) => ({ ...f, sshUser: e.target.value }))} className="rounded-xl" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input placeholder="Remote path" value={backupForm.sshPath} onChange={(e) => setBackupForm((f) => ({ ...f, sshPath: e.target.value }))} className="rounded-xl" />
                                <Input type="password" placeholder="SSH Password (opcional)" value={backupForm.sshPassword} onChange={(e) => setBackupForm((f) => ({ ...f, sshPassword: e.target.value }))} className="rounded-xl" />
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cron schedule (opcional)</label>
                        <Input value={backupForm.schedule} onChange={(e) => setBackupForm((f) => ({ ...f, schedule: e.target.value }))} className="rounded-xl font-mono" placeholder="0 3 * * *" />
                    </div>

                    <Button onClick={saveBackupConfig} className="rounded-xl" isLoading={backupLoading}>
                        <Save className="w-4 h-4 mr-2" /> Guardar configuracion
                    </Button>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                    <h2 className="text-lg font-bold flex items-center gap-2"><ServerCog className="w-4 h-4 text-primary" /> Backup Streams</h2>
                    <div className="mt-4 space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {activeBackups.map((b: any) => (
                            <button key={b.id} onClick={() => startRestoreFlow(b.id)} className="w-full text-left rounded-xl border border-border p-3 hover:bg-muted/30 transition">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {b.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : b.status === "failed" ? <CircleAlert className="w-4 h-4 text-red-500" /> : <Clock3 className="w-4 h-4 text-amber-500" />}
                                        <span className="text-xs font-semibold uppercase tracking-wider">{b.status}</span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">{new Date(b.startedAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm font-semibold mt-2 truncate">{b.filename || "backup-no-name"}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.log || "Sin log detallado"}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {restoringId && (
                <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 space-y-4">
                    <h3 className="font-bold text-red-700 flex items-center gap-2"><TerminalSquare className="w-4 h-4" /> Restore guardrail</h3>
                    {restoreLoading ? (
                        <p className="text-sm text-muted-foreground">Analizando snapshot seleccionado...</p>
                    ) : (
                        <>
                            {restorePreview?.message && <p className="text-sm font-medium">{restorePreview.message}</p>}
                            {restorePreview?.affected && <p className="text-xs text-muted-foreground">Afecta: {restorePreview.affected}</p>}
                            {restorePreview?.warnings?.length ? (
                                <ul className="text-xs text-red-700 list-disc pl-5 space-y-1">
                                    {restorePreview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            ) : null}
                            {restoreCompare ? (
                                <div className="rounded-xl border border-red-200 bg-white p-3 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-red-700">Comparacion previa</p>
                                    <p className="text-xs">
                                        Riesgo:{" "}
                                        <span className={cn(
                                            "font-bold uppercase",
                                            restoreCompare.comparison?.risk === "high" ? "text-red-600" :
                                            restoreCompare.comparison?.risk === "medium" ? "text-amber-600" : "text-emerald-600"
                                        )}>
                                            {restoreCompare.comparison?.risk || "unknown"}
                                        </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Delta de tamano: {typeof restoreCompare.comparison?.sizeDeltaPercent === "number"
                                            ? `${restoreCompare.comparison.sizeDeltaPercent}%`
                                            : "N/A"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Snapshot actual DB: {restoreCompare.liveDatabaseSnapshot?.users ?? 0} users, {restoreCompare.liveDatabaseSnapshot?.files ?? 0} files, {restoreCompare.liveDatabaseSnapshot?.folders ?? 0} folders
                                    </p>
                                    {Array.isArray(restoreCompare.comparison?.warnings) && restoreCompare.comparison.warnings.length > 0 ? (
                                        <ul className="text-xs text-red-700 list-disc pl-5 space-y-1">
                                            {restoreCompare.comparison.warnings.map((w: string, i: number) => <li key={`cmp-${i}`}>{w}</li>)}
                                        </ul>
                                    ) : null}
                                </div>
                            ) : null}
                            <Input
                                value={restoreConfirmText}
                                onChange={(e) => setRestoreConfirmText(e.target.value)}
                                placeholder='Escribe "RESTORE" para confirmar'
                                className="rounded-xl bg-white"
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="destructive"
                                    onClick={confirmRestore}
                                    disabled={restoreConfirmText !== "RESTORE" || restoreLoading}
                                    isLoading={restoreLoading}
                                >
                                    Ejecutar restore real
                                </Button>
                                <Button variant="outline" onClick={() => { setRestoringId(null); setRestorePreview(null); setRestoreConfirmText(""); setRestoreCompare(null); }}>
                                    Cancelar
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
