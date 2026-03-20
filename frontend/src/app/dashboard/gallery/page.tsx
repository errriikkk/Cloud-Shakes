"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Image as ImageIcon, Grid, List, Loader2, Download, Share2, Eye, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useTranslation } from "@/lib/i18n";

interface ImageFile {
    id: string;
    originalName: string;
    storedName: string;
    size: number;
    mimeType: string;
    createdAt: string;
    previewUrl?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function GalleryPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const router = useRouter();
    const [images, setImages] = useState<ImageFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"grid" | "masonry">("masonry");
    const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (user) {
            fetchImages();
        }
    }, [user]);

    const fetchImages = async () => {
        try {
            setLoading(true);
            const res = await axios.get(API_ENDPOINTS.FILES.BASE, { withCredentials: true });
            
            // Handle both old array and new {data, pagination} format
            const files = res.data.data || res.data || [];
            
            // Filter only image files
            const imageFiles = files.filter((file: any) => 
                file.mimeType?.startsWith('image/')
            );

            // Attach backend preview endpoint URL directly
            const imagesWithPreview: ImageFile[] = imageFiles.map((file: ImageFile) => ({
                ...file,
                previewUrl: `${API_BASE}/api/files/${file.id}/preview`,
            }));

            // Sort by creation date (newest first)
            imagesWithPreview.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setImages(imagesWithPreview);
        } catch (err) {
            console.error('Error fetching images:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleImageClick = (image: ImageFile) => {
        setSelectedImage(image);
        setPreviewUrl(image.previewUrl || `${API_BASE}/api/files/${image.id}/preview`);
    };

    const handleDownload = async (image: ImageFile) => {
        try {
            const res = await axios.get(
                `${API_BASE}/api/files/${image.id}/download`,
                { withCredentials: true, responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', image.originalName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error downloading image:', err);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                            {t('gallery.title')}
                        </h1>
                        <p className="text-muted-foreground mt-2 text-sm font-medium">
                            {images.length} {images.length === 1 ? t('gallery.image') : t('gallery.images')} {t('gallery.inStorage')}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                viewMode === "grid"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            )}
                            title={t('files.viewGrid')}
                        >
                            <Grid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode("masonry")}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                viewMode === "masonry"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            )}
                            title={t('files.viewList')}
                        >
                            <ImageIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Images Grid */}
                {images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <ImageIcon className="w-16 h-16 text-muted-foreground/20 mb-4" />
                        <p className="text-muted-foreground font-medium">{t('gallery.noImages')}</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">{t('gallery.uploadPrompt')}</p>
                    </div>
                ) : (
                    <div
                        className={cn(
                            "grid gap-3",
                            viewMode === "grid"
                                ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                                : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                        )}
                    >
                        {images.map((image, index) => (
                            <motion.div
                                key={image.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.02 }}
                                className="group relative aspect-square rounded-xl overflow-hidden bg-muted/30 border border-border/40 hover:border-border/60 cursor-pointer transition-all hover:shadow-lg"
                                onClick={() => handleImageClick(image)}
                            >
                                {image.previewUrl ? (
                                    <img
                                        src={image.previewUrl}
                                        alt={image.originalName}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                                    </div>
                                )}
                                
                                {/* Overlay on hover */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(image);
                                            }}
                                            className="p-2 bg-background/90 rounded-lg hover:bg-background transition-colors"
                                        >
                                            <Download className="w-4 h-4 text-foreground" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/dashboard/files?preview=${image.id}`);
                                            }}
                                            className="p-2 bg-background/90 rounded-lg hover:bg-background transition-colors"
                                        >
                                            <Eye className="w-4 h-4 text-foreground" />
                                        </button>
                                    </div>
                                </div>

                                {/* Image info */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-xs text-white font-medium truncate">{image.originalName}</p>
                                    <p className="text-[10px] text-white/80">{formatBytes(image.size)}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Full Screen Preview Modal */}
            {mounted && selectedImage && createPortal(
                <AnimatePresence>
                    {selectedImage && (
                        <div
                            className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-sm flex items-center justify-center"
                            onClick={() => {
                                setSelectedImage(null);
                                setPreviewUrl(null);
                            }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {previewUrl ? (
                                    <img
                                        src={previewUrl}
                                        alt={selectedImage.originalName}
                                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                                    />
                                ) : (
                                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                                )}

                                {/* Close button */}
                                <button
                                    onClick={() => {
                                        setSelectedImage(null);
                                        setPreviewUrl(null);
                                    }}
                                    className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5 text-white" />
                                </button>

                                {/* Image info */}
                                <div className="absolute bottom-4 left-4 right-4 bg-black/60 rounded-lg p-4">
                                    <p className="text-sm text-white font-medium">{selectedImage.originalName}</p>
                                    <p className="text-xs text-white/80 mt-1">
                                        {formatBytes(selectedImage.size)} • {new Date(selectedImage.createdAt).toLocaleDateString()}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="absolute top-4 left-4 flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownload(selectedImage)}
                                        className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
                                    >
                                        <Download className="w-5 h-5 text-white" />
                                    </button>
                                    <button
                                        onClick={() => router.push(`/dashboard/files?preview=${selectedImage.id}`)}
                                        className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
                                    >
                                        <Eye className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}

