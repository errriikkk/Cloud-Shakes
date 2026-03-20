"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { FileText, Download, Loader2, Music, X } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface FileItem {
    id: string;
    originalName: string;
    storedName: string;
    size: number;
    mimeType: string;
    createdAt: string;
}

interface PreviewModalProps {
    file: FileItem | null;
    isOpen: boolean;
    onClose: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const TEXT_EXTENSIONS = /\.(txt|md|json|xml|js|ts|jsx|tsx|css|html|htm|py|java|cpp|c|h|php|rb|go|rs|sh|bash|yaml|yml|toml|ini|conf|log|env|sql|graphql|vue|svelte)$/i;
const CODE_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript", "application/x-sh"];

export function PreviewModal({ file, isOpen, onClose }: PreviewModalProps) {
    const [url, setUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isOpen || !file) {
            setUrl(null);
            setTextContent(null);
            setError("");
            return;
        }

        const fetchPreviewUrl = async () => {
            try {
                setLoading(true);
                setError("");

                const isTextFile = CODE_MIME_PREFIXES.some(p => file.mimeType.startsWith(p)) ||
                    file.mimeType === "text/plain" ||
                    file.originalName.match(TEXT_EXTENSIONS);

                if (isTextFile) {
                    try {
                        const res = await axios.get(`${API}/api/files/${file.id}/download`, {
                            withCredentials: true,
                            responseType: 'text',
                        });
                        setTextContent(res.data);
                    } catch {
                        const res = await axios.get(`${API}/api/files/${file.id}/preview`, { withCredentials: true });
                        setUrl(res.data?.url || `${API}/api/files/${file.id}/preview`);
                    }
                } else {
                    setUrl(`${API}/api/files/${file.id}/preview`);
                }
            } catch (err) {
                console.error("Failed to load preview URL", err);
                setError("Failed to load preview.");
            } finally {
                setLoading(false);
            }
        };

        fetchPreviewUrl();
    }, [isOpen, file]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        if (isOpen) window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [isOpen, onClose]);

    if (!file) return null;

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-16 md:py-24 text-muted-foreground">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                    <p className="text-sm font-semibold">Loading preview...</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Just a moment</p>
                </div>
            );
        }

        if ((error || !url) && textContent === null) {
            return (
                <div className="flex flex-col items-center justify-center py-16 md:py-24 text-muted-foreground">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
                        <FileText className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-semibold text-center px-4">{error || "Preview not available for this file."}</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Download the file to open it locally.</p>
                </div>
            );
        }

        if (file.mimeType.startsWith("image/")) {
            return (
                <div className="flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10 rounded-2xl overflow-hidden min-h-[220px] md:min-h-[320px] border border-border/30 shadow-inner">
                    <img
                        src={url!}
                        alt={file.originalName}
                        className="max-w-full max-h-[50vh] md:max-h-[65vh] object-contain drop-shadow-lg rounded-lg"
                    />
                </div>
            );
        }

        if (file.mimeType.startsWith("video/")) {
            return (
                <div className="flex items-center justify-center bg-black/5 rounded-2xl overflow-hidden min-h-[220px] md:min-h-[360px] border border-border/30">
                    <video
                        src={url!}
                        controls
                        className="max-w-full max-h-[50vh] md:max-h-[70vh] rounded-lg"
                        playsInline
                    />
                </div>
            );
        }

        if (file.mimeType.startsWith("audio/")) {
            return (
                <div className="flex flex-col items-center justify-center bg-gradient-to-b from-primary/5 to-muted/20 rounded-2xl py-10 md:py-14 min-h-[200px] border border-border/30">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                        <Music className="w-10 h-10 text-primary" />
                    </div>
                    <audio src={url!} controls className="w-full max-w-md rounded-xl" />
                </div>
            );
        }

        if (file.mimeType === "application/pdf") {
            return (
                <div className="w-full h-[55vh] md:h-[65vh] bg-muted/20 rounded-2xl overflow-hidden border border-border/30 shadow-inner">
                    <iframe src={`${url}#toolbar=0`} className="w-full h-full border-0 rounded-lg" title="PDF Preview" />
                </div>
            );
        }

        const officeMimes = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
        ];
        if (officeMimes.includes(file.mimeType)) {
            return (
                <div className="flex flex-col items-center justify-center py-16 md:py-24 text-muted-foreground">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                        <FileText className="w-8 h-8 text-amber-600" />
                    </div>
                    <p className="text-sm font-semibold text-center px-4">Preview not available for this document type.</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Download to open with Word, Excel, or PowerPoint.</p>
                </div>
            );
        }

        if (textContent !== null || CODE_MIME_PREFIXES.some(p => file.mimeType.startsWith(p)) || file.originalName.match(TEXT_EXTENSIONS)) {
            return (
                <div className="w-full h-[55vh] md:h-[65vh] bg-muted/20 rounded-2xl overflow-auto border border-border/30 p-4 md:p-6 custom-scrollbar">
                    {textContent !== null ? (
                        <pre className="text-xs md:text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {textContent}
                        </pre>
                    ) : loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <p className="text-sm">Could not load content.</p>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center py-16 md:py-24 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
                    <FileText className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-semibold text-center px-4">Preview not available for this file type.</p>
                <p className="text-xs text-muted-foreground/70 mt-2">Type: {file.mimeType}</p>
            </div>
        );
    };

    const handleDownload = () => {
        window.open(`${API}/api/files/${file.id}/download`, '_blank');
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998] bg-black/60 md:bg-black/50 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className="pointer-events-auto w-full h-full md:h-auto md:max-h-[90vh] md:w-full md:max-w-4xl bg-background flex flex-col overflow-hidden md:rounded-3xl md:border md:border-border/60 md:shadow-2xl"
                        >
                            {/* Header: sticky, responsive */}
                            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4 border-b border-border/40 bg-background/95 backdrop-blur-sm shrink-0">
                                <h3 className="text-sm md:text-base font-bold text-foreground truncate flex-1 min-w-0">
                                    {file.originalName}
                                </h3>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 md:p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0 touch-manipulation"
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content: scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 custom-scrollbar">
                                {renderContent()}
                            </div>

                            {/* Footer: size, type, actions */}
                            <div className="shrink-0 border-t border-border/40 bg-muted/20 px-4 md:px-6 py-3 md:py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-4 text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        <span>{formatSize(file.size)}</span>
                                        <span className="opacity-70">{file.mimeType}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl">
                                            Close
                                        </Button>
                                        <Button size="sm" onClick={handleDownload} className="rounded-xl gap-2">
                                            <Download className="w-4 h-4" />
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );

    if (typeof document !== "undefined") {
        return createPortal(modalContent, document.body);
    }
    return null;
}
