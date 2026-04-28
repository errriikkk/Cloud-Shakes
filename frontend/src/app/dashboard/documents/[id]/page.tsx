"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { API_ENDPOINTS } from "@/lib/api";
import { PermissionGuard } from "@/components/PermissionGuard";
import { TipTapEditor } from "@/components/editor/TipTapEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePermission } from "@/hooks/usePermission";
import { useTranslation } from "@/lib/i18n";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type Version = { id: string; title: string; createdAt: string };
type Doc = { id: string; title: string; content: any; updatedAt: string };
type Presence = { userId: string; username: string; displayName?: string; at: number };
type AccessItem = { userId: string; permission: "read" | "edit" | "review" | "full"; user?: { id: string; username: string; displayName?: string } | null };

const socketUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const docId = params?.id as string;
  const { canEditDocuments, canCommentDocuments, canReviewDocuments } = usePermission();
  const { t } = useTranslation();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");

  // Dynamic document title
  const docTitle = useMemo(() => {
    if (title) {
      return `${title} - Documentos`;
    }
    return 'Cargando documento... - Documentos';
  }, [title]);
  
  useDocumentTitle(docTitle);
  const [content, setContent] = useState<any>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [versions, setVersions] = useState<Version[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [commentText, setCommentText] = useState("");
  const [suggestText, setSuggestText] = useState("");
  const [accessList, setAccessList] = useState<AccessItem[]>([]);
  const [shareUsername, setShareUsername] = useState("");
  const [sharePermission, setSharePermission] = useState<"read" | "edit" | "review" | "full">("read");
  const socketRef = useRef<Socket | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [docRes, versionsRes] = await Promise.all([
      axios.get(API_ENDPOINTS.DOCUMENTS.DETAIL(docId), { withCredentials: true }),
      axios.get(API_ENDPOINTS.DOCUMENTS.VERSIONS(docId), { withCredentials: true }),
    ]);
    setDoc(docRes.data);
    setTitle(docRes.data?.title || "");
    setContent(docRes.data?.content || {});
    setVersions(versionsRes.data?.versions || []);
    try {
      const accessRes = await axios.get(API_ENDPOINTS.DOCUMENTS.ACCESS(docId), { withCredentials: true });
      setAccessList(accessRes.data?.access || []);
    } catch {
      setAccessList([]);
    }
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    load();
  }, [docId, load]);

  const save = useCallback(async (nextTitle: string, nextContent: any, saveVersion = false) => {
    setSaveState("saving");
    await axios.put(
      API_ENDPOINTS.DOCUMENTS.DETAIL(docId),
      { title: nextTitle, content: nextContent, saveVersion },
      { withCredentials: true }
    );
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 900);
  }, [docId]);

  const queueSave = useCallback((nextTitle: string, nextContent: any) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save(nextTitle, nextContent);
      socketRef.current?.emit("doc:content", { docId, content: nextContent, title: nextTitle });
    }, 450);
  }, [docId, save]);

  useEffect(() => {
    const socket = io(socketUrl, { withCredentials: true, transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("doc:join", { docId });
    socket.on("doc:presence", (users: Presence[]) => setPresence(users));
    socket.on("doc:content", ({ content: incoming, title: incomingTitle }: { content: any; title: string }) => {
      setContent(incoming);
      setTitle(incomingTitle);
    });
    return () => {
      socket.emit("doc:leave", { docId });
      socket.disconnect();
    };
  }, [docId]);

  const onEditorChange = useCallback((next: any) => {
    setContent(next);
    queueSave(title, next);
  }, [queueSave, title]);

  const onTitleChange = useCallback((nextTitle: string) => {
    setTitle(nextTitle);
    queueSave(nextTitle, content);
  }, [content, queueSave]);

  const restoreVersion = useCallback(async (versionId: string) => {
    await axios.post(API_ENDPOINTS.DOCUMENTS.RESTORE(docId, versionId), {}, { withCredentials: true });
    await load();
  }, [docId, load]);

  const addComment = useCallback(async () => {
    if (!commentText.trim()) return;
    await axios.post(API_ENDPOINTS.DOCUMENTS.COMMENTS(docId), { text: commentText.trim() }, { withCredentials: true });
    setCommentText("");
    await load();
  }, [commentText, docId, load]);

  const addSuggestion = useCallback(async () => {
    if (!suggestText.trim()) return;
    await axios.post(
      API_ENDPOINTS.DOCUMENTS.SUGGESTIONS(docId),
      { suggestedText: suggestText.trim(), reason: "Manual suggestion" },
      { withCredentials: true }
    );
    setSuggestText("");
    await load();
  }, [docId, load, suggestText]);

  const addAccess = useCallback(async () => {
    if (!shareUsername.trim()) return;
    await axios.post(
      API_ENDPOINTS.DOCUMENTS.ACCESS(docId),
      { targetUsername: shareUsername.trim(), permission: sharePermission },
      { withCredentials: true }
    );
    setShareUsername("");
    await load();
  }, [docId, load, sharePermission, shareUsername]);

  const removeAccess = useCallback(async (userId: string) => {
    await axios.delete(API_ENDPOINTS.DOCUMENTS.ACCESS_USER(docId, userId), { withCredentials: true });
    await load();
  }, [docId, load]);

  const comments = useMemo(() => (content && Array.isArray(content.__comments) ? content.__comments : []), [content]);
  const suggestions = useMemo(() => (content && Array.isArray(content.__suggestions) ? content.__suggestions : []), [content]);
  const outline = useMemo(() => {
    const nodes = Array.isArray(content?.content) ? content.content : [];
    return nodes
      .filter((n: any) => n?.type === "heading")
      .map((n: any, idx: number) => ({
        id: `h-${idx}`,
        level: n?.attrs?.level || 1,
        text: Array.isArray(n?.content) ? n.content.map((p: any) => p?.text || "").join("") : "Heading",
      }));
  }, [content]);

  return (
    <PermissionGuard permission="view_documents" fallback={<div className="text-sm text-muted-foreground">Sin acceso.</div>}>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 h-full">
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Input value={title} onChange={(e) => onTitleChange(e.target.value)} disabled={!canEditDocuments()} />
            <span className="text-xs text-muted-foreground min-w-[80px] text-right">{saveState}</span>
          </div>
          <TipTapEditor content={content} onChange={onEditorChange} editable={canEditDocuments()} placeholder="Start writing..." />
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-sm font-semibold mb-2">Realtime presence</p>
            <div className="space-y-1">
              {presence.map((p) => (
                <div key={p.userId} className="text-xs text-muted-foreground">
                  {p.displayName || p.username}
                </div>
              ))}
              {presence.length === 0 && <div className="text-xs text-muted-foreground">No active collaborators</div>}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-sm font-semibold mb-2">Outline</p>
            <div className="space-y-1 max-h-40 overflow-auto">
              {outline.map((h: { id: string; level: number; text: string }) => (
                <div key={h.id} className="text-xs text-muted-foreground" style={{ paddingLeft: `${(h.level - 1) * 10}px` }}>
                  {h.text || "Heading"}
                </div>
              ))}
              {outline.length === 0 && <div className="text-xs text-muted-foreground">No headings yet</div>}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-sm font-semibold mb-2">Versions</p>
            <div className="space-y-2 max-h-52 overflow-auto">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{new Date(v.createdAt).toLocaleString()}</span>
                  <Button size="sm" variant="outline" onClick={() => restoreVersion(v.id)}>Restore</Button>
                </div>
              ))}
            </div>
            <Button className="mt-2 w-full" size="sm" variant="secondary" onClick={() => save(title, content, true)}>
              Save snapshot
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-sm font-semibold mb-2">Document access</p>
            <div className="space-y-2 mb-2 max-h-40 overflow-auto">
              {accessList.map((a) => (
                <div key={a.userId} className="flex items-center justify-between gap-2 text-xs border border-border/40 rounded p-2">
                  <span className="truncate">
                    {a.user?.displayName || a.user?.username || a.userId} · {a.permission}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-rose-500" onClick={() => removeAccess(a.userId)}>
                    Remove
                  </Button>
                </div>
              ))}
              {accessList.length === 0 && <div className="text-xs text-muted-foreground">No shared users yet</div>}
            </div>
            <div className="flex gap-2">
              <Input value={shareUsername} onChange={(e) => setShareUsername(e.target.value)} placeholder="username" />
              <select
                className="border border-border/60 rounded-md bg-background px-2 py-2 text-xs"
                value={sharePermission}
                onChange={(e) => setSharePermission(e.target.value as any)}
              >
                <option value="read">read</option>
                <option value="edit">edit</option>
                <option value="review">review</option>
                <option value="full">full</option>
              </select>
            </div>
            <Button className="mt-2 w-full" size="sm" onClick={addAccess}>
              Add person
            </Button>
          </div>

          {canCommentDocuments() && (
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <p className="text-sm font-semibold mb-2">Comments</p>
              <div className="space-y-2 mb-2 max-h-44 overflow-auto">
                {comments.map((c: any) => (
                  <div key={c.id} className="text-xs border border-border/40 rounded p-2">
                    <div className="font-medium">{c.createdBy?.displayName || c.createdBy?.username || "User"}</div>
                    <div className="text-muted-foreground">{c.text}</div>
                  </div>
                ))}
              </div>
              <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..." />
              <Button className="mt-2 w-full" size="sm" onClick={addComment}>Comment</Button>
            </div>
          )}

          {canReviewDocuments() && (
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <p className="text-sm font-semibold mb-2">Track changes</p>
              <div className="space-y-2 mb-2 max-h-44 overflow-auto">
                {suggestions.map((s: any) => (
                  <div key={s.id} className="text-xs border border-border/40 rounded p-2">
                    <div className="font-medium">{s.status || "pending"}</div>
                    <div className="text-muted-foreground">{s.suggestedText || s.originalText || "Suggestion"}</div>
                  </div>
                ))}
              </div>
              <Input value={suggestText} onChange={(e) => setSuggestText(e.target.value)} placeholder="Write a suggestion..." />
              <Button className="mt-2 w-full" size="sm" onClick={addSuggestion}>Add suggestion</Button>
            </div>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
