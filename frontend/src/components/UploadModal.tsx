import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, File as FileIcon, CheckCircle, CloudUpload, Folder as FolderIcon, AlertCircle } from "lucide-react";
import { Button } from "./ui/Button";
import { Modal, ModalFooter } from "./ui/Modal";
import { cn } from "@/lib/utils";
import { scanItems, ScannedFile } from "@/lib/fileScanner";
import { useUploads } from "@/context/UploadContext";
import { useTranslation } from "@/lib/i18n";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { ConfirmModal } from "./ConfirmModal";

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUploadComplete: () => void;
    currentFolderId: string | null;
    initialFiles?: (File | ScannedFile)[] | null;
}

export function UploadModal({ isOpen, onClose, currentFolderId, initialFiles }: UploadModalProps) {
    const [files, setFiles] = useState<(File | ScannedFile)[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addUploads } = useUploads();
    const { t } = useTranslation();
    const [existingFilenames, setExistingFilenames] = useState<string[]>([]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<ScannedFile[]>([]);
    const [conflictingNames, setConflictingNames] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchExistingFiles();
        }
    }, [isOpen, currentFolderId]);

    const fetchExistingFiles = async () => {
        try {
            const params: any = {};
            if (currentFolderId) params.folder = currentFolderId;
            
            const res = await axios.get(API_ENDPOINTS.FILES.BASE, { 
                params,
                withCredentials: true 
            });
            
            const files = res.data.data || res.data || [];
            setExistingFilenames(files.map((f: any) => f.originalName));
        } catch (err) {
            console.error("Error fetching existing files:", err);
            // We don't block the user if this fails, just proceed without collision check
            setExistingFilenames([]);
        }
    };

    useEffect(() => {
        if (initialFiles && initialFiles.length > 0) {
            setFiles(initialFiles);
        }
    }, [initialFiles]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const items = await scanItems(e.dataTransfer.items);
            setFiles(items);
        } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFiles(Array.from(e.dataTransfer.files));
        }
    }, []);

    const handleUploadClick = () => {
        if (files.length === 0) return;

        // Transform any plain File objects into ScannedFile format for the context
        const normalizedFiles: ScannedFile[] = files.map(f => {
            if ('path' in f) return f;
            return { file: f, path: "" };
        });

        // Check for collisions
        const collisions = normalizedFiles.filter(f => 
            existingFilenames.includes(f.file.name)
        ).map(f => f.file.name);

        if (collisions.length > 0) {
            setConflictingNames(collisions);
            setPendingFiles(normalizedFiles);
            setShowConfirmModal(true);
        } else {
            processUpload(normalizedFiles);
        }
    };

    const processUpload = (filesToUpload: ScannedFile[]) => {
        addUploads(filesToUpload, currentFolderId);
        onClose();
        setFiles([]);
        setShowConfirmModal(false);
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const clearFiles = () => {
        setFiles([]);
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const getFileName = (item: File | ScannedFile) => {
        return 'file' in item ? item.file.name : item.name;
    };

    const getFileSize = (item: File | ScannedFile) => {
        return 'file' in item ? item.file.size : item.size;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t("upload.modal.title")} width="max-w-xl">
            <div className="space-y-4">
                <div
                    className={cn(
                        "border-2 border-dashed rounded-[2rem] p-10 flex flex-col items-center justify-center transition-all cursor-pointer",
                        dragActive
                            ? "border-primary/50 bg-primary/5 shadow-inner shadow-primary/5"
                            : files.length > 0
                                ? "border-primary/20 bg-muted/30"
                                : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileChange}
                        multiple
                    />

                    {files.length > 0 ? (
                        <div className="text-left w-full max-h-[300px] overflow-y-auto px-4 custom-scrollbar">
                            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("upload.modal.selectedItems")}</span>
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{files.length}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); clearFiles(); }}
                                    className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-red-50"
                                >
                                    {t("upload.modal.clearFiles")}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {files.slice(0, 50).map((f, idx) => (
                                    <div key={idx} className="group/item flex items-center gap-3 p-2.5 rounded-xl border border-border/40 bg-background/40 hover:border-primary/20 transition-all">
                                        <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold text-foreground truncate">{getFileName(f)}</p>
                                            <p className="text-[9px] text-muted-foreground font-medium">
                                                {formatSize(getFileSize(f))}
                                                {'path' in f && f.path && <span className="ml-2 italic opacity-60">{t("upload.modal.inPath").replace("{path}", f.path)}</span>}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                            className="p-1.5 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-red-500 transition-all rounded-lg hover:bg-red-50"
                                            title={t("common.remove")}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                                {files.length > 50 && (
                                    <p className="text-[10px] text-center text-muted-foreground py-2 italic">{t("upload.modal.moreFiles").replace("{count}", (files.length - 50).toString())}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/10 text-primary">
                                <CloudUpload className="w-7 h-7" />
                            </div>
                            <p className="text-sm text-foreground font-bold">{t("upload.modal.dragDrop")}</p>
                            <p className="text-xs text-muted-foreground mt-1 font-medium italic">{t("upload.modal.clickBrowse")}</p>
                        </div>
                    )}
                </div>

                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                        {t("upload.modal.note")}
                    </p>
                </div>

                <ModalFooter center>
                    <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
                    <Button
                        onClick={handleUploadClick}
                        disabled={files.length === 0}
                        variant="premium"
                    >
                        {t("upload.modal.start").replace("{count}", files.length.toString())}
                    </Button>
                </ModalFooter>
            </div>
            <ConfirmModal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={() => processUpload(pendingFiles)}
                title={t("upload.modal.collisionTitle") || "Archivo Existente"}
                message={`${t("upload.modal.collisionMessage") || "Los siguientes archivos ya existen en esta carpeta. ¿Deseas reemplazarlos?"} \n\n ${conflictingNames.join(", ")}`}
                type="warning"
                confirmText={t("common.replace") || "Reemplazar"}
                cancelText={t("common.cancel") || "Cancelar"}
            />
        </Modal>
    );
}
