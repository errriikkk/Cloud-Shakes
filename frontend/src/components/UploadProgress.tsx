"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUploads } from '@/context/UploadContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CloudUpload, CheckCircle, XCircle, ChevronUp,
    ChevronDown, X, Loader2, File
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function UploadProgress({ hasSelection }: { hasSelection?: boolean }) {
    const { uploads, totalProgress, clearCompleted, isUploading } = useUploads();
    const [isExpanded, setIsExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted || uploads.length === 0) return null;

    const completed = uploads.filter(u => u.status === 'completed').length;
    const errors = uploads.filter(u => u.status === 'error').length;
    const active = uploads.length - completed - errors;

    const content = (
        <div className={cn(
            "fixed left-1/2 z-[10000] -translate-x-1/2 w-96 transition-all duration-500",
            hasSelection ? "bottom-32" : "bottom-8"
        )}>
            <motion.div
                initial={{ y: 100, opacity: 0, x: "-50%" }}
                animate={{ y: 0, opacity: 1, x: "-50%" }}
                className="bg-white/95 backdrop-blur-2xl border-2 border-primary/20 rounded-3xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-primary/20">
                    <div className="flex items-center gap-3">
                        {isUploading ? (
                            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            </div>
                        ) : errors > 0 ? (
                            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                <XCircle className="w-4 h-4 text-red-600" />
                            </div>
                        ) : (
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                        )}
                        <div>
                            <span className="text-sm font-bold text-foreground uppercase tracking-wider">
                                {isUploading ? 'Subiendo archivos...' : 'Subida completada'}
                            </span>
                            <p className="text-xs text-muted-foreground font-medium">
                                {active > 0 ? `${active} archivo${active > 1 ? 's' : ''} en proceso` : `${completed} de ${uploads.length} completado${completed > 1 ? 's' : ''}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 hover:bg-muted rounded-lg transition-colors"
                        >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                        {!isUploading && (
                            <button
                                onClick={clearCompleted}
                                className="p-1 hover:bg-muted rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Progress Bar */}
                <div className="px-5 py-4 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Progreso total
                        </span>
                        <span className="text-sm font-bold text-primary">{totalProgress}%</span>
                    </div>
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${totalProgress}%` }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className={cn(
                                "h-full rounded-full transition-all duration-300 relative overflow-hidden",
                                errors > 0 && !isUploading ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-primary to-primary/80"
                            )}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </motion.div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{completed} completado{completed > 1 ? 's' : ''}</span>
                        <span>{errors} error{errors > 1 ? 'es' : ''}</span>
                        <span>{active} en proceso</span>
                    </div>
                </div>

                {/* Expanded List */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="border-t border-primary/20 max-h-[300px] overflow-y-auto custom-scrollbar bg-muted/10"
                        >
                            <div className="p-3 space-y-2">
                                {uploads.map((upload) => (
                                    <motion.div 
                                        key={upload.id} 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/50 transition-all text-xs border border-border/20"
                                    >
                                        <div className="shrink-0">
                                            {upload.status === 'completed' ? (
                                                <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                                                </div>
                                            ) : upload.status === 'error' ? (
                                                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                                                    <XCircle className="w-3 h-3 text-red-600" />
                                                </div>
                                            ) : upload.status === 'creating_folders' ? (
                                                <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
                                                    <CloudUpload className="w-3 h-3 text-primary animate-pulse" />
                                                </div>
                                            ) : (
                                                <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
                                                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-foreground truncate text-xs">{upload.file.name}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">
                                                {upload.status === 'creating_folders' ? 'Creando carpeta...' :
                                                    upload.status === 'error' ? upload.error :
                                                        upload.path ? `en ${upload.path}` : 'Raíz'}
                                            </p>
                                        </div>
                                        {upload.status === 'uploading' && (
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-1 bg-muted rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${upload.progress}%` }}
                                                        className="h-full bg-primary rounded-full"
                                                    />
                                                </div>
                                                <span className="font-bold text-primary text-xs">{upload.progress}%</span>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );

    return createPortal(content, document.body);
}
