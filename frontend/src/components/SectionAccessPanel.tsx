"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Shield, Check, X, Info, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type AccessItem = {
  permission: string;
  label?: string;
  description?: string;
};

type SectionAccess = {
  key: string;
  title: string;
  items: AccessItem[];
};

function sectionFromPath(pathname: string): string {
  if (pathname.startsWith("/dashboard/files") || pathname === "/dashboard") return "files";
  if (pathname.startsWith("/dashboard/notes")) return "notes";
  if (pathname.startsWith("/dashboard/documents")) return "documents";
  if (pathname.startsWith("/dashboard/calendar")) return "calendar";
  if (pathname.startsWith("/dashboard/links")) return "links";
  if (pathname.startsWith("/dashboard/gallery")) return "gallery";
  if (pathname.startsWith("/dashboard/chat")) return "chat";
  if (pathname.startsWith("/dashboard/statistics")) return "statistics";
  if (pathname.startsWith("/dashboard/activity")) return "activity";
  if (pathname.startsWith("/dashboard/plugins")) return "plugins";
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  if (pathname.startsWith("/dashboard/home")) return "home";
  return "other";
}

function getSectionAccess(sectionKey: string): SectionAccess | null {
  const sections: Record<string, SectionAccess> = {
    home: {
      key: "home",
      title: "Inicio",
      items: [],
    },
    files: {
      key: "files",
      title: "Archivos",
      items: [
        { permission: "view_files" },
        {
          permission: "view_workspace_files",
          label: "Ver archivos de otros usuarios (solo Owner/Admin)",
          description:
            "Sin este permiso solo puedes ver tus archivos y los compartidos contigo.",
        },
        { permission: "preview_files" },
        { permission: "download_files" },
        { permission: "upload_files" },
        { permission: "share_files" },
        { permission: "delete_files" },
        { permission: "create_folders" },
        { permission: "organize_folders" },
        { permission: "delete_folders" },
        { permission: "rename_files" },
      ],
    },
    notes: {
      key: "notes",
      title: "Notas",
      items: [
        { permission: "view_notes" },
        { permission: "create_notes" },
        { permission: "edit_notes" },
        { permission: "delete_notes" },
      ],
    },
    documents: {
      key: "documents",
      title: "Documentos",
      items: [
        { permission: "view_documents" },
        { permission: "create_documents" },
        { permission: "edit_documents" },
        { permission: "comment_documents" },
        { permission: "share_documents" },
        { permission: "review_documents" },
        { permission: "delete_documents" },
      ],
    },
    calendar: {
      key: "calendar",
      title: "Calendario",
      items: [
        { permission: "view_calendar" },
        { permission: "create_events" },
        { permission: "edit_events" },
        { permission: "delete_events" },
      ],
    },
    links: {
      key: "links",
      title: "Enlaces",
      items: [
        { permission: "view_links" },
        { permission: "create_links" },
        { permission: "delete_links" },
      ],
    },
    gallery: {
      key: "gallery",
      title: "Galería",
      items: [
        { permission: "view_gallery" },
        { permission: "upload_images" },
        { permission: "delete_images" },
      ],
    },
    chat: {
      key: "chat",
      title: "Chat",
      items: [
        { permission: "view_chat" },
        { permission: "send_messages" },
        { permission: "edit_messages" },
        { permission: "delete_messages" },
        { permission: "create_chats" },
        { permission: "create_group_chats" },
        { permission: "manage_group_chats" },
        { permission: "delete_conversations" },
        { permission: "mention_users" },
        { permission: "send_attachments" },
        { permission: "create_calls" },
        { permission: "join_calls" },
        { permission: "manage_calls" },
      ],
    },
    statistics: {
      key: "statistics",
      title: "Estadísticas",
      items: [
        { permission: "view_statistics" },
        { permission: "export_statistics" },
      ],
    },
    activity: {
      key: "activity",
      title: "Actividad",
      items: [
        { permission: "view_activity" },
        { permission: "export_activity" },
      ],
    },
    plugins: {
      key: "plugins",
      title: "Plugins",
      items: [{ permission: "view_plugins" }],
    },
    settings: {
      key: "settings",
      title: "Ajustes",
      items: [
        // Personal settings are always visible; these permissions only affect admin/system blocks.
        { permission: "view_settings", label: "Acceso a Ajustes" },
        { permission: "manage_settings" },
        { permission: "manage_integrations" },
        { permission: "manage_backups" },
        { permission: "manage_users" },
        { permission: "manage_roles" },
      ],
    },
  };

  return sections[sectionKey] || null;
}

export function SectionAccessPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const sectionKey = useMemo(() => sectionFromPath(pathname), [pathname]);
  const section = useMemo(() => getSectionAccess(sectionKey), [sectionKey]);

  const roleLabel = useMemo(() => {
    if (!user) return "";
    if (user.isAdmin) return "Admin";
    const roles = user.roles || [];
    return roles.length ? roles.join(", ") : "Usuario";
  }, [user]);

  const accessItems = useMemo(() => {
    if (!user || !section) return [];
    const perms = new Set(user.permissions || []);
    return section.items.map((it) => {
      const granted = user.isAdmin || perms.has(it.permission);
      const label =
        it.label ||
        (t(`permissions.labels.${it.permission}`) as string) ||
        it.permission;
      return { ...it, granted, label };
    });
  }, [user, section, t]);

  // If section has no meaningful items, still show the panel (role info + explanation).
  if (!user) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "z-[90] flex flex-col items-end gap-2",
          embedded
            ? "sticky top-3 ml-auto w-fit"
            : "fixed right-4 bottom-32 lg:bottom-24"
        )}
        data-marquee-ignore="true"
      >
        <Button
          variant="secondary"
          className={cn(
            "border border-border/60 backdrop-blur bg-background/90 h-11 px-4",
            embedded ? "rounded-xl shadow-sm" : "rounded-full shadow-xl"
          )}
          onClick={() => setOpen(true)}
        >
          <Shield className="w-4 h-4 mr-2" />
          Acceso y rol
          <Sparkles className="w-4 h-4 ml-2 opacity-70" />
        </Button>
      </motion.div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Tu acceso en esta sección"
        width="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">
                  Sección: <span className="font-extrabold">{section?.title || "Dashboard"}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Rol: <span className="font-semibold text-foreground">{roleLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esto se calcula a partir de tus permisos actuales. Si algo no cuadra, pide al admin que revise tu rol.
                </p>
              </div>
            </div>
          </div>

          {accessItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                Permisos relevantes
              </p>
              <div className="divide-y divide-border/40 rounded-2xl border border-border/60 overflow-hidden">
                {accessItems.map((it) => (
                  <div
                    key={it.permission}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3",
                      it.granted ? "bg-green-500/5" : "bg-red-500/5"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{it.label}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{it.permission}</p>
                      {it.description ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{it.description}</p>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                        it.granted
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : "bg-red-500/10 text-red-600 border-red-500/20"
                      )}
                      title={it.granted ? "Permitido" : "No permitido"}
                    >
                      {it.granted ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No hay permisos específicos para mostrar en esta sección.
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

