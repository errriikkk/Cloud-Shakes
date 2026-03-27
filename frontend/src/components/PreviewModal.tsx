"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { FileText, Download, Loader2, Music, X, Link as LinkIcon, Share2, Maximize2, File, Image as ImageIcon, Video, Film, FileAudio, FileCode, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface FileItem {
    id: string;
    originalName: string;
    storedName?: string;
    size?: number;
    mimeType: string;
    createdAt?: string;
}

interface PreviewModalProps {
    file: FileItem | null;
    isOpen: boolean;
    onClose: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const TEXT_EXTENSIONS = /\.(txt|md|json|xml|js|ts|jsx|tsx|css|html|htm|py|java|cpp|c|h|php|rb|go|rs|sh|bash|yaml|yml|toml|ini|conf|log|env|sql|graphql|vue|svelte)$/i;
const CODE_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript", "application/x-sh"];

const getFileTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-8 h-8" />;
    if (mimeType.startsWith('video/')) return <Film className="w-8 h-8" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="w-8 h-8" />;
    if (CODE_MIME_PREFIXES.some(p => mimeType.startsWith(p)) || mimeType === "text/plain" || mimeType.match(TEXT_EXTENSIONS)) return <FileCode className="w-8 h-8" />;
    if (mimeType.includes('pdf')) return <FileText className="w-8 h-8" />;
    return <File className="w-8 h-8" />;
};

const getFileTypeColor = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return "from-blue-500/20 to-blue-600/10 text-blue-500";
    if (mimeType.startsWith('video/')) return "from-purple-500/20 to-purple-600/10 text-purple-500";
    if (mimeType.startsWith('audio/')) return "from-pink-500/20 to-pink-600/10 text-pink-500";
    if (mimeType.includes('pdf')) return "from-orange-500/20 to-orange-600/10 text-orange-500";
    return "from-primary/20 to-primary/10 text-primary";
};

export function PreviewModal({ file, isOpen, onClose }: PreviewModalProps) {
    const { t } = useTranslation();
    const [url, setUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [imageZoom, setImageZoom] = useState(1);
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isFullscreen]);

    if (!file) return null;

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                        <div className="absolute inset-0 rounded-3xl bg-primary/20 animate-pulse" />
                    </div>
                    <p className="text-sm font-semibold mt-6">Loading preview...</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Just a moment</p>
                </div>
            );
        }

        // PDFs - show friendly message instead of trying to preview
        if (file.mimeType === "application/pdf") {
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mb-6 shadow-xl">
                        <FileText className="w-12 h-12 text-orange-500" />
                    </div>
                    <p className="text-base font-semibold text-foreground mb-2">Oops!</p>
                    <p className="text-sm text-muted-foreground text-center px-4 mb-6">
                        {t("preview.pdfNotSupported")}
                    </p>
                    <Button size="sm" onClick={handleDownload} className="rounded-xl px-6 gap-2">
                        <Download className="w-4 h-4" />
                        {t("preview.download")}
                    </Button>
                </div>
            );
        }

        if ((error || !url) && textContent === null) {
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                    <div className={cn("w-20 h-20 rounded-3xl bg-gradient-to-br flex items-center justify-center mb-6", getFileTypeColor(file.mimeType))}>
                        {getFileTypeIcon(file.mimeType)}
                    </div>
                    <p className="text-sm font-semibold text-center px-4">{error || "Preview not available"}</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Download to view locally</p>
                </div>
            );
        }

        if (file.mimeType.startsWith("image/")) {
            const handleWheel = (e: React.WheelEvent) => {
                if (!isFullscreen) return;
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.2 : 0.2;
                setImageZoom(z => Math.min(4, Math.max(0.5, z + delta)));
            };

            const handleMouseDown = (e: React.MouseEvent) => {
                if (!isFullscreen || imageZoom <= 1) return;
                e.preventDefault();
                setIsDragging(true);
                setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
            };

            const handleMouseMove = (e: React.MouseEvent) => {
                if (!isDragging) return;
                setImagePosition({ 
                    x: e.clientX - dragStart.x, 
                    y: e.clientY - dragStart.y 
                });
            };

            const handleMouseUp = () => setIsDragging(false);

            return (
                <div 
                    className="relative flex items-center justify-center h-full min-h-[400px] overflow-hidden select-none"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ 
                        cursor: isFullscreen && imageZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                    }}
                >
                    <img
                        src={url!}
                        alt={file.originalName}
                        className="max-w-full max-h-[70vh] lg:max-h-[75vh] object-contain rounded-2xl shadow-2xl"
                        style={{ 
                            transform: isFullscreen ? `scale(${imageZoom}) translate(${imagePosition.x / imageZoom}px, ${imagePosition.y / imageZoom}px)` : undefined,
                            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                            pointerEvents: 'none',
                        }}
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                    />
                    {isFullscreen && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
                            <button 
                                onClick={() => { setImageZoom(z => Math.max(0.5, z - 0.5)); setImagePosition({ x: 0, y: 0 }); }}
                                className="p-1.5 rounded-full hover:bg-white/20 text-white"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <span className="text-white text-xs font-medium min-w-[50px] text-center">{Math.round(imageZoom * 100)}%</span>
                            <button 
                                onClick={() => setImageZoom(z => Math.min(4, z + 0.5))}
                                className="p-1.5 rounded-full hover:bg-white/20 text-white"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => { setImageZoom(1); setImagePosition({ x: 0, y: 0 }); }}
                                className="p-1.5 rounded-full hover:bg-white/20 text-white ml-2"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (file.mimeType.startsWith("video/")) {
            return (
                <div className="flex items-center justify-center h-full min-h-[400px] bg-black/5 rounded-2xl overflow-hidden">
                    <video
                        src={url!}
                        controls
                        className="max-w-full max-h-[70vh] lg:max-h-[75vh] rounded-xl"
                        playsInline
                    />
                </div>
            );
        }

        if (file.mimeType.startsWith("audio/")) {
            return (
                <div className={cn("flex flex-col items-center justify-center h-full min-h-[250px] rounded-3xl py-12 bg-gradient-to-br", getFileTypeColor(file.mimeType))}>
                    <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-8 shadow-lg">
                        <Music className="w-12 h-12" />
                    </div>
                    <audio src={url!} controls className="w-full max-w-lg rounded-xl" />
                </div>
            );
        }

        // Office documents - show preview card with download option
        const officeMimes = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
            "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.spreadsheet",
        ];
        
        if (officeMimes.includes(file.mimeType)) {
            const ext = file.originalName.split('.').pop()?.toUpperCase() || 'DOC';
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mb-6 shadow-xl">
                        <FileText className="w-12 h-12 text-amber-500" />
                    </div>
                    <p className="text-base font-semibold text-foreground mb-2">{ext} Document</p>
                    <p className="text-sm text-muted-foreground text-center px-4 mb-6">Preview not available for this file type</p>
                    <Button size="sm" onClick={handleDownload} className="rounded-xl px-6 gap-2">
                        <Download className="w-4 h-4" />
                        Download to View
                    </Button>
                </div>
            );
        }

        if (textContent !== null || CODE_MIME_PREFIXES.some(p => file.mimeType.startsWith(p)) || file.originalName.match(TEXT_EXTENSIONS)) {
            return (
                <div className="w-full h-[60vh] lg:h-[70vh] bg-muted/20 rounded-2xl overflow-auto border border-border/30 p-4 lg:p-8 custom-scrollbar">
                    {textContent !== null ? (
                        <pre className="text-xs lg:text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
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
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                <div className={cn("w-20 h-20 rounded-3xl bg-gradient-to-br flex items-center justify-center mb-6", getFileTypeColor(file.mimeType))}>
                    {getFileTypeIcon(file.mimeType)}
                </div>
                <p className="text-sm font-semibold text-center px-4">Preview not available</p>
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
                        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-md"
                    />
                    <div className={cn(
                        "fixed z-[9999] flex items-center justify-center pointer-events-none",
                        isFullscreen ? "inset-0 p-0" : "inset-0 p-4"
                    )}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                "pointer-events-auto bg-background flex flex-col overflow-hidden",
                                isFullscreen ? "w-full h-full" : "w-full max-w-5xl max-h-[90vh] rounded-3xl border border-border/60 shadow-2xl"
                            )}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border/40 bg-background/95 backdrop-blur-sm shrink-0">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", getFileTypeColor(file.mimeType))}>
                                        {getFileTypeIcon(file.mimeType)}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-bold text-foreground truncate">{file.originalName}</h3>
                                        <p className="text-xs text-muted-foreground">{formatSize(file.size || 0)} • {file.mimeType.split('/')[1]}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => setIsFullscreen(!isFullscreen)}
                                        className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                                    >
                                        <Maximize2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                        aria-label="Close"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar bg-gradient-to-b from-muted/10 to-transparent">
                                {renderContent()}
                            </div>

                            {/* Footer */}
                            <div className="shrink-0 border-t border-border/40 bg-muted/20 px-6 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="px-2 py-1 rounded-md bg-muted/60 font-medium">{file.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                                        <span>•</span>
                                        <span>{file.createdAt ? new Date(file.createdAt).toLocaleDateString() : '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl px-4">
                                            Close
                                        </Button>
                                        <Button size="sm" onClick={handleDownload} className="rounded-xl px-5 gap-2 shadow-lg shadow-primary/20">
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
