"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Clock3, FileText, Plus, Search, SortAsc, Trash2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/lib/i18n";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { showPermissionDenied } from "@/lib/permissionFeedback";

type DocItem = {
  id: string;
  title: string;
  updatedAt: string;
  commentsCount?: number;
  suggestionsCount?: number;
};

export default function DocumentsPage() {
  const { canCreateDocuments, canDeleteDocuments } = usePermission();
  const { t, locale } = useTranslation();
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "title" | "activity">("recent");

  // Dynamic document title
  const docsTitle = useMemo(() => {
    const lang = locale === 'es' ? 'es' : 'en';
    const title = lang === 'es' ? 'Documentos' : 'Documents';
    if (q.trim()) {
      return `(${documents.length}) ${q} - ${lang === 'es' ? 'búsqueda' : 'search'} - ${title}`;
    }
    const label = lang === 'es' ? 'documentos' : 'documents';
    return `${title} (${documents.length} ${label}) - ${title}`;
  }, [documents.length, q, locale]);
  
  useDocumentTitle(docsTitle);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.DOCUMENTS.BASE, { params: { q }, withCredentials: true });
      setDocuments(res.data?.data || []);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(fetchDocuments, 220);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  const createDocument = useCallback(async () => {
    setCreating(true);
    try {
      const res = await axios.post(
        API_ENDPOINTS.DOCUMENTS.BASE,
        { title: "Untitled document" },
        { withCredentials: true }
      );
      const id = res.data?.id;
      if (id) window.location.href = `/dashboard/documents/${id}`;
    } finally {
      setCreating(false);
    }
  }, []);

  const removeDocument = useCallback(async (id: string) => {
    await axios.delete(API_ENDPOINTS.DOCUMENTS.DETAIL(id), { withCredentials: true });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const countLabel = useMemo(() => `${documents.length} documento(s)`, [documents.length]);
  const sortedDocuments = useMemo(() => {
    const copy = [...documents];
    if (sortBy === "title") {
      copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      return copy;
    }
    if (sortBy === "activity") {
      copy.sort(
        (a, b) =>
          ((b.commentsCount || 0) + (b.suggestionsCount || 0)) -
          ((a.commentsCount || 0) + (a.suggestionsCount || 0))
      );
      return copy;
    }
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return copy;
  }, [documents, sortBy]);
  const totalComments = useMemo(
    () => documents.reduce((acc, d) => acc + (d.commentsCount || 0), 0),
    [documents]
  );
  const totalSuggestions = useMemo(
    () => documents.reduce((acc, d) => acc + (d.suggestionsCount || 0), 0),
    [documents]
  );

  return (
    <PermissionGuard permission="view_documents" fallback={<div className="text-sm text-muted-foreground">Sin acceso.</div>}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-background p-5">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Documents</h1>
              <p className="text-sm text-muted-foreground">Centro de trabajo documental: crea, busca y mantiene todo actualizado.</p>
            </div>
            <Button
              onClick={createDocument}
              disabled={creating || !canCreateDocuments()}
              showBlockedFeedback={!canCreateDocuments()}
              blockedPermission="create_documents"
              blockedReason="No tienes permiso para crear documentos."
              className="rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              {creating ? "Creating..." : "New document"}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total docs</p>
              <p className="text-xl font-bold">{documents.length}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Comments</p>
              <p className="text-xl font-bold">{totalComments}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Suggestions</p>
              <p className="text-xl font-bold">{totalSuggestions}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Last update</p>
              <p className="text-sm font-semibold truncate">
                {documents[0]?.updatedAt ? new Date(documents[0].updatedAt).toLocaleString() : "N/A"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." className="pl-9 rounded-xl" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-2 py-1">
            <SortAsc className="w-4 h-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "title" | "activity")}
              className="bg-transparent text-sm outline-none"
            >
              <option value="recent">Most recent</option>
              <option value="title">Title</option>
              <option value="activity">Most active</option>
            </select>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={fetchDocuments}>
            Refresh
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">{loading ? "Loading..." : countLabel}</div>

        {sortedDocuments.length === 0 && !loading ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-10 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold">No documents yet</p>
            <p className="text-sm text-muted-foreground mt-1">Crea un documento para empezar tu workspace editorial.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sortedDocuments.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-border/60 bg-card p-4 hover:shadow-sm transition-shadow">
                <Link href={`/dashboard/documents/${doc.id}`} className="block">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{doc.title || "Untitled document"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock3 className="w-3 h-3" />
                        Updated {new Date(doc.updatedAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {doc.commentsCount || 0} comments · {doc.suggestionsCount || 0} suggestions
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-500"
                    onClick={() => {
                      if (!canDeleteDocuments()) {
                        showPermissionDenied("No tienes permiso para eliminar documentos.", "delete_documents");
                        return;
                      }
                      removeDocument(doc.id);
                    }}
                    disabled={!canDeleteDocuments()}
                    showBlockedFeedback={!canDeleteDocuments()}
                    blockedPermission="delete_documents"
                    blockedReason="No tienes permiso para eliminar documentos."
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
