import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, File as FileIcon, CheckCircle, CloudUpload, Folder as FolderIcon, AlertCircle } from "lucide-react";
import { Button } from "./ui/Button";
import { Modal, ModalFooter } from "./ui/Modal";
import { cn } from "@/lib/utils";
import { scanItems, ScannedFile } from "@/lib/fileScanner";
import { useUploads } from "@/context/UploadContext";

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

        addUploads(normalizedFiles, currentFolderId);
        onClose();
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
        <Modal isOpen={isOpen} onClose={onClose} title="Preparar Subida" width="max-w-xl">
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
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Elementos Seleccionados</span>
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{files.length}</span>
                            </div>
                            <div className="space-y-2">
                                {files.slice(0, 50).map((f, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl border border-border/40 bg-background/40">
                                        <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold text-foreground truncate">{getFileName(f)}</p>
                                            <p className="text-[9px] text-muted-foreground font-medium">
                                                {formatSize(getFileSize(f))}
                                                {'path' in f && f.path && <span className="ml-2 italic opacity-60">en {f.path}</span>}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {files.length > 50 && (
                                    <p className="text-[10px] text-center text-muted-foreground py-2 italic">...y {files.length - 50} archivos más</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/10 text-primary">
                                <CloudUpload className="w-7 h-7" />
                            </div>
                            <p className="text-sm text-foreground font-bold">Arrastra carpetas o archivos aquí</p>
                            <p className="text-xs text-muted-foreground mt-1 font-medium italic">o haz clic para explorar</p>
                        </div>
                    )}
                </div>

                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                        Al pulsar <b>"Iniciar Subida"</b>, los archivos se procesarán en segundo plano.
                        Podrás seguir navegando sin interrumpir el proceso.
                    </p>
                </div>

                <ModalFooter center>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        onClick={handleUploadClick}
                        disabled={files.length === 0}
                        variant="premium"
                    >
                        Iniciar Subida ({files.length})
                    </Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}
