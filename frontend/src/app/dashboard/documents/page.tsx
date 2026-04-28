"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
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

  return (
    <PermissionGuard permission="view_documents" fallback={<div className="text-sm text-muted-foreground">Sin acceso.</div>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Documents</h1>
            <p className="text-sm text-muted-foreground">Editor avanzado con permisos, versiones y colaboración.</p>
          </div>
          <Button
            onClick={createDocument}
            disabled={creating || !canCreateDocuments()}
            showBlockedFeedback={!canCreateDocuments()}
            blockedPermission="create_documents"
            blockedReason="No tienes permiso para crear documentos."
          >
            <Plus className="w-4 h-4 mr-2" />
            {creating ? "Creating..." : "New document"}
          </Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." className="pl-9" />
        </div>

        <div className="text-xs text-muted-foreground">{loading ? "Loading..." : countLabel}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-border/60 bg-card p-4">
              <Link href={`/dashboard/documents/${doc.id}`} className="block">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{doc.title || "Untitled document"}</p>
                    <p className="text-xs text-muted-foreground">Updated {new Date(doc.updatedAt).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
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
      </div>
    </PermissionGuard>
  );
}
