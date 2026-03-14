"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FileText, Download, Loader2, Image as ImageIcon, Video, Music } from "lucide-react";

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
                
                // Check if it's a text file
                const isTextFile = file.mimeType.startsWith("text/") || 
                    file.originalName.match(/\.(txt|md|json|xml|js|ts|jsx|tsx|css|html|py|java|cpp|c|php|rb|go|rs)$/i);
                
                if (isTextFile) {
                    // For text files, fetch the content directly
                    try {
                        const res = await axios.get(`${API}/api/files/${file.id}/download`, {
                            withCredentials: true,
                            responseType: 'text',
                        });
                        setTextContent(res.data);
                    } catch {
                        // Fallback to preview URL
                        const res = await axios.get(`${API}/api/files/${file.id}/preview`, { withCredentials: true });
                        setUrl(res.data.url);
                    }
                } else {
                    // For other files, just use backend streaming endpoint as URL
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

    if (!file) return null;

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary/40" />
                    <p className="text-sm font-medium">Loading preview...</p>
                </div>
            );
        }

        if (error || !url) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
                    <FileText className="w-12 h-12 mb-4 text-muted-foreground/20" />
                    <p className="text-sm font-medium">{error || "Preview not available for this file."}</p>
                </div>
            );
        }

        if (file.mimeType.startsWith("image/")) {
            return (
                <div className="flex items-center justify-center bg-muted/20 rounded-2xl overflow-hidden min-h-[200px] border border-border/40">
                    <img src={url} alt={file.originalName} className="max-w-full max-h-[60vh] object-contain" />
                </div>
            );
        }

        if (file.mimeType.startsWith("video/")) {
            return (
                <div className="flex items-center justify-center bg-muted/20 rounded-2xl overflow-hidden min-h-[200px] border border-border/40">
                    <video src={url} controls className="max-w-full max-h-[60vh]" />
                </div>
            );
        }

        if (file.mimeType.startsWith("audio/")) {
            return (
                <div className="flex flex-col items-center justify-center bg-muted/20 rounded-2xl p-8 min-h-[200px] border border-border/40">
                    <Music className="w-12 h-12 text-primary/60 mb-6" />
                    <audio src={url} controls className="w-full max-w-md" />
                </div>
            );
        }

        if (file.mimeType === "application/pdf") {
            return (
                <div className="w-full h-[60vh] bg-muted/20 rounded-2xl overflow-hidden border border-border/40">
                    <iframe src={`${url}#toolbar=0`} className="w-full h-full border-0" title="PDF Preview" />
                </div>
            );
        }

        // Office documents (Word, Excel, PowerPoint) - show via Google Docs Viewer or similar
        if (
            file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
            file.mimeType === "application/msword" ||
            file.mimeType === "application/vnd.ms-excel" ||
            file.mimeType === "application/vnd.ms-powerpoint"
        ) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
                    <FileText className="w-16 h-16 mb-4 text-muted-foreground/20" />
                    <p className="text-sm font-medium mb-2">Vista previa no disponible para este tipo de archivo.</p>
                    <p className="text-xs text-muted-foreground/60">Descarga el archivo para abrirlo con la aplicación correspondiente.</p>
                </div>
            );
        }

        // Text and code files
        const isTextOrCode = file.mimeType.startsWith("text/") || 
            file.originalName.match(/\.(txt|md|json|xml|js|ts|jsx|tsx|css|html|py|java|cpp|c|php|rb|go|rs|sh|bash|yaml|yml|toml|ini|conf|log)$/i);
        
        if (isTextOrCode) {
            return (
                <div className="w-full h-[60vh] bg-muted/20 rounded-2xl overflow-auto border border-border/40 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
                        </div>
                    ) : textContent !== null ? (
                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                            {textContent}
                        </pre>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60">
                            <FileText className="w-12 h-12 mb-2 text-muted-foreground/20" />
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground/60">
                            <p className="text-sm">No se pudo cargar el contenido</p>
                        </div>
                    )}
                </div>
            );
        }

        // Generic Fallback
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
                <FileText className="w-16 h-16 mb-4 text-muted-foreground/20" />
                <p className="text-sm font-medium mb-2">Vista previa no disponible para este tipo de archivo.</p>
                <p className="text-xs text-muted-foreground/60">Tipo: {file.mimeType}</p>
            </div>
        );
    };

    const handleDownload = () => {
        window.open(`${API}/api/files/${file.id}/download`, '_blank');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={file.originalName}
        >
            <div className="space-y-4">
                {renderContent()}

                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-2 opacity-60">
                    <span>{formatSize(file.size)}</span>
                    <span className="uppercase">{file.mimeType}</span>
                </div>

                <ModalFooter>
                    <Button variant="ghost" onClick={onClose}>Close</Button>
                    <Button onClick={handleDownload}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};
