"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";

import {
    File as FileIcon, Trash2, Link as LinkIcon, FileText,
    Image as ImageIcon, Video, Music, Download, Copy,
    CheckCircle, Search, Clock, Edit2, Check, X, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PreviewModal } from "@/components/PreviewModal";
import { CreateFolderModal } from "@/components/CreateFolderModal";
import { UploadModal } from "@/components/UploadModal";
import { CreateLinkModal } from "@/components/CreateLinkModal";
import {
    Folder as FolderIcon, ChevronRight, ChevronLeft, Plus,
    MoreHorizontal, Grid, List as ListIcon, Upload
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { API_ENDPOINTS } from "@/lib/api";
import { scanItems, ScannedFile } from "@/lib/fileScanner";
import { UploadProgress } from "./UploadProgress";



interface FileItem {
    id: string;
    originalName: string;
    storedName: string;
    size: number;
    mimeType: string;
    createdAt: string;
    folderId?: string;
}

interface ActivityItem {
    id: string;
    type: string;
    action: string;
    resourceId: string | null;
    resourceType: string | null;
    resourceName: string | null;
    createdAt: string;
}

interface FolderItem {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
}

interface FileBrowserProps {
    refreshTrigger: number;
    searchQuery?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function FileBrowser({ refreshTrigger, searchQuery = "" }: FileBrowserProps) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const canRename = !!(user?.isAdmin || user?.permissions?.includes('rename_files'));
    const canDelete = !!(user?.isAdmin || user?.permissions?.includes('delete_files'));
    const [files, setFiles] = useState<FileItem[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('viewMode') as "grid" | "list") || "grid";
        }
        return "grid";
    });

    useEffect(() => {
        localStorage.setItem('viewMode', viewMode);
    }, [viewMode]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [loadingPreviews, setLoadingPreviews] = useState<Record<string, boolean>>({});

    // Navigation state
    const router = useRouter();
    const searchParams = useSearchParams();
    const folderParam = searchParams.get('folder');
    const previewParam = searchParams.get('preview');
    const [path, setPath] = useState<{ id: string | null, name: string }[]>([{ id: null, name: t("files.myUnit") }]);

    // Modal states
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string, type: 'file' | 'folder' } | null>(null);
    const [createLinkModalOpen, setCreateLinkModalOpen] = useState(false);
    const [linkFileId, setLinkFileId] = useState<string | null>(null);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [createdLink, setCreatedLink] = useState("");
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    
    // Rename state
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [itemToRename, setItemToRename] = useState<{ id: string, name: string, type: 'file' | 'folder' } | null>(null);
    const [newName, setNewName] = useState("");

    // Delete state with progress
    const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; item: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [uploadInitialFiles, setUploadInitialFiles] = useState<(File | ScannedFile)[]>([]);

    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [globalDragActive, setGlobalDragActive] = useState(false);
    const [selectedItems, setSelectedItems] = useState<{ id: string, type: 'file' | 'folder' }[]>([]);
    const [mounted, setMounted] = useState(false);
    const [activities, setActivities] = useState<Record<string, ActivityItem[]>>({});
    const [hoverActivityId, setHoverActivityId] = useState<string | null>(null);

    // Limpiar el estado de drag cuando se abre/cierra el modal de subida
    useEffect(() => {
        if (!isUploadOpen) {
            setGlobalDragActive(false);
            setUploadInitialFiles([]);
        }
    }, [isUploadOpen]);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Selection Marquee state
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const fetchItems = async (silent = false) => {
        try {
            if (!silent) {
                setLoading(true);
                // Clear current items to avoid showing stale content
                setFiles([]);
                setFolders([]);
            }
            const [filesRes, foldersRes] = await Promise.all([
                axios.get(`${API}/api/files`, {
                    params: { folderId: folderParam },
                    withCredentials: true
                }),
                axios.get(`${API}/api/folders`, {
                    params: { parentId: folderParam },
                    withCredentials: true
                })
            ]);
            // Handle both old array and new {data, pagination} format
            const files = filesRes.data.data || filesRes.data || [];
            setFiles(files);
            setFolders(foldersRes.data);
            // After files load, fetch activities for these resources
            const ids = files.map((f: any) => f.id);
            if (ids.length > 0) {
                try {
                    const actRes = await axios.get(`${API}/api/activity`, {
                        params: { limit: 200 },
                        withCredentials: true
                    });
                    const byResource: Record<string, ActivityItem[]> = {};
                    (actRes.data as ActivityItem[]).forEach((a) => {
                        if (a.resourceId) {
                            if (!byResource[a.resourceId]) byResource[a.resourceId] = [];
                            byResource[a.resourceId].push(a);
                        }
                    });
                    setActivities(byResource);
                } catch (e) {
                    // ignore activity errors
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (!silent) setLoading(false);
        }
    };


    useEffect(() => {
        const loadPreviews = () => {
            const previewable = files.filter(f =>
                f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/')
            );
            const newPreviews: Record<string, string> = {};
            const newLoading: Record<string, boolean> = {};
            previewable.forEach((file) => {
                if (!previews[file.id]) {
                    newPreviews[file.id] = `${API}/api/files/${file.id}/preview`;
                    newLoading[file.id] = true;
                }
            });
            if (Object.keys(newPreviews).length > 0) {
                setPreviews(prev => ({ ...prev, ...newPreviews }));
                setLoadingPreviews(prev => ({ ...prev, ...newLoading }));
            }
        };
        if (files.length > 0) loadPreviews();
    }, [files, previews]);

    useEffect(() => {
        const syncPath = async () => {
            if (folderParam) {
                try {
                    const res = await axios.get(API_ENDPOINTS.FOLDERS.DETAIL(folderParam), { withCredentials: true });
                    if (res.data.trail) {
                        setPath(res.data.trail);
                    }
                } catch (err) {
                    console.error("Failed to sync folder path:", err);
                }
            } else {
                setPath([{ id: null, name: t("files.myUnit") }]);
            }
        };
        syncPath();
        fetchItems();

        const handleUploadComplete = () => {
            fetchItems(true);
        };
        window.addEventListener('uploadComplete', handleUploadComplete);
        return () => window.removeEventListener('uploadComplete', handleUploadComplete);
    }, [folderParam, refreshTrigger]);


    useEffect(() => {
        if (previewParam && files.length > 0) {
            const file = files.find(f => f.id === previewParam);
            if (file) {
                setPreviewFile(file);
            }
        } else if (!previewParam) {
            setPreviewFile(null);
        }
    }, [previewParam, files]);

    const navigateToFolder = (folder: FolderItem) => {
        setSelectedItems([]); // Clear selection on navigate
        router.push(`/dashboard/files?folder=${folder.id}`);
    };

    const navigateBack = (index: number) => {
        setSelectedItems([]); // Clear selection on navigate
        const target = path[index];
        if (target.id) {
            router.push(`/dashboard/files?folder=${target.id}`);
        } else {
            router.push("/dashboard/files");
        }
    };

    const toggleItemSelection = (id: string, type: 'file' | 'folder', e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        setSelectedItems(prev => {
            const isSelected = prev.find(i => i.id === id);
            if (isSelected) {
                return prev.filter(i => i.id !== id);
            } else {
                return [...prev, { id, type }];
            }
        });
    };

    const handleMouseDown = (e: MouseEvent) => {
        // Only start if left click and not on an interactive element
        if (e.button !== 0) return;

        // Check if clicking on an ignored element (like menu toggle or sidebar)
        const target = e.target as HTMLElement;
        if (target.closest('[data-marquee-ignore="true"]')) return;

        // Check if clicking on the background container or something that isn't a file/folder card
        const interactiveSelectors = ['button', 'a', 'input', 'select', 'textarea', '[role="button"]'];
        const isInteractive = interactiveSelectors.some(selector => target.closest(selector));

        // If clicking on a checkbox or specific action button, don't start marquee
        if (isInteractive) return;

        // If clicking on a draggable item (file/folder), don't start marquee
        if (target.closest('[draggable]')) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const startX = e.clientX + (containerRef.current?.scrollLeft || 0) - rect.left;
        const startY = e.clientY + (containerRef.current?.scrollTop || 0) - rect.top;

        setIsSelecting(true);
        setSelectionBox({ startX, startY, endX: startX, endY: startY });

        // Clear selection if not holding shift/cmd
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
            setSelectedItems([]);
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isSelecting || !selectionBox || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentX = e.clientX + (containerRef.current.scrollLeft || 0) - rect.left;
        const currentY = e.clientY + (containerRef.current.scrollTop || 0) - rect.top;

        const newBox = {
            ...selectionBox,
            endX: currentX,
            endY: currentY
        };
        setSelectionBox(newBox);

        // Calculate intersections
        const boxLeft = Math.min(newBox.startX, newBox.endX);
        const boxTop = Math.min(newBox.startY, newBox.endY);
        const boxRight = Math.max(newBox.startX, newBox.endX);
        const boxBottom = Math.max(newBox.startY, newBox.endY);

        const newlySelected: { id: string, type: 'file' | 'folder' }[] = [];

        const containerRect = containerRef.current.getBoundingClientRect();

        itemRefs.current.forEach((el, id) => {
            const elRect = el.getBoundingClientRect();

            // Calculate item coordinates relative to the container (scroll-aware)
            const itemLeft = elRect.left - containerRect.left + containerRef.current!.scrollLeft;
            const itemTop = elRect.top - containerRect.top + containerRef.current!.scrollTop;
            const itemRight = itemLeft + elRect.width;
            const itemBottom = itemTop + elRect.height;

            const intersects = (
                itemLeft < boxRight &&
                itemRight > boxLeft &&
                itemTop < boxBottom &&
                itemBottom > boxTop
            );

            if (intersects) {
                const folder = folders.find(f => f.id === id);
                const file = files.find(f => f.id === id);
                if (folder) newlySelected.push({ id, type: 'folder' });
                if (file) newlySelected.push({ id, type: 'file' });
            }
        });

        // Combine with existing selection if modifier keys are pressed
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            setSelectedItems(prev => {
                const combined = [...prev];
                newlySelected.forEach(item => {
                    if (!combined.find(i => i.id === item.id)) {
                        combined.push(item);
                    }
                });
                return combined;
            });
        } else {
            setSelectedItems(newlySelected);
        }
    };


    const handleMouseUp = () => {
        setIsSelecting(false);
        setSelectionBox(null);
    };

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            handleMouseDown(e);
        };

        window.addEventListener('mousedown', onMouseDown);
        return () => window.removeEventListener('mousedown', onMouseDown);
    }, [handleMouseDown]);

    useEffect(() => {
        if (isSelecting) {
            const onMouseMove = (e: MouseEvent) => {
                handleMouseMove(e);
            };
            const onMouseUp = () => {
                handleMouseUp();
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            return () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
        }
    }, [isSelecting, selectionBox, handleMouseMove, handleMouseUp]);

    const handleBulkDelete = async () => {
        if (selectedItems.length === 0) return;
        
        setDeleteProgress({ current: 0, total: selectedItems.length, item: `${selectedItems.length} elementos` });
        setDeleteError(null);
        
        try {
            const fileIds = selectedItems.filter(i => i.type === 'file').map(i => i.id);
            const folderIds = selectedItems.filter(i => i.type === 'folder').map(i => i.id);

            let successCount = 0;
            let errorCount = 0;
            let errors: string[] = [];

            // Delete files one by one to handle individual errors
            for (const id of fileIds) {
                try {
                    await axios.delete(`${API}/api/files/${id}`, { withCredentials: true });
                    successCount++;
                } catch (err: any) {
                    errorCount++;
                    const msg = err.response?.data?.message || err.message || 'Error';
                    if (!msg.includes('NotFound') && !errors.includes(msg)) {
                        errors.push(msg);
                    }
                }
                setDeleteProgress({ current: successCount + errorCount, total: fileIds.length + folderIds.length, item: 'Eliminando archivos...' });
            }

            // Delete folders one by one
            for (const id of folderIds) {
                try {
                    await axios.delete(`${API}/api/folders/${id}`, { withCredentials: true });
                    successCount++;
                } catch (err: any) {
                    errorCount++;
                    const msg = err.response?.data?.message || err.message || 'Error';
                    if (!errors.includes(msg)) {
                        errors.push(msg);
                    }
                }
                setDeleteProgress({ current: successCount + errorCount, total: fileIds.length + folderIds.length, item: 'Eliminando carpetas...' });
            }

            fetchItems(true);
            setSelectedItems([]);
            window.dispatchEvent(new CustomEvent('folderUpdate'));
            
            if (errorCount > 0 && successCount > 0) {
                setDeleteError(`Eliminados ${successCount}. Errores: ${errorCount}`);
            } else if (errorCount > 0) {
                setDeleteError(errors[0] || 'Error al eliminar algunos archivos');
            }
            
            setDeleteProgress({ current: successCount + errorCount, total: fileIds.length + folderIds.length, item: 'Completado' });
            
            setTimeout(() => {
                setDeleteModalOpen(false);
                setDeleteProgress(null);
                setDeleteError(null);
            }, 1500);
        } catch (err: any) {
            const message = err.response?.data?.message || err.message || 'Error al eliminar';
            setDeleteError(message);
            console.error("Bulk delete failed:", err);
        }
    };

    // Handle Delete
    const confirmDelete = (id: string, name: string, type: 'file' | 'folder') => {
        setItemToDelete({ id, name, type });
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        
        setDeleteProgress({ current: 0, total: 1, item: itemToDelete.name });
        setDeleteError(null);
        
        try {
            const endpoint = itemToDelete.type === 'file' ? `files` : `folders`;
            await axios.delete(`${API}/api/${endpoint}/${itemToDelete.id}`, { withCredentials: true });
            
            if (itemToDelete.type === 'file') {
                setFiles(files.filter(f => f.id !== itemToDelete.id));
            } else {
                setFolders(folders.filter(f => f.id !== itemToDelete.id));
                window.dispatchEvent(new CustomEvent('folderUpdate'));
            }
            setSelectedFile(null);
            setDeleteProgress({ current: 1, total: 1, item: itemToDelete.name });
            
            // Close after short delay to show completion
            setTimeout(() => {
                setDeleteModalOpen(false);
                setItemToDelete(null);
                setDeleteProgress(null);
            }, 500);
        } catch (err: any) {
            // Handle different error types
            let message = 'Error al eliminar';
            
            if (err.response?.data?.message) {
                message = err.response.data.message;
            } else if (err.code === 'ERR_NETWORK' || err.message.includes('Network')) {
                message = 'Error de conexión. Inténtalo de nuevo.';
            } else if (err.message?.includes('NotFound') || err.message?.includes('S3Error')) {
                message = 'El archivo no existe en el almacenamiento. Puede que ya haya sido eliminado.';
            } else if (err.message) {
                message = err.message;
            }
            
            setDeleteError(message);
            console.error("Delete failed:", err);
        }
    };

    // Handle Rename
    const confirmRename = (id: string, name: string, type: 'file' | 'folder') => {
        setItemToRename({ id, name, type });
        setNewName(name); // Default to current name
        setRenameModalOpen(true);
    };

    const handleRename = async () => {
        if (!itemToRename || !newName.trim()) return;
        try {
            const endpoint = itemToRename.type === 'file' ? 'files' : 'folders';
            await axios.patch(`${API}/api/${endpoint}/${itemToRename.id}/rename`, { newName }, { withCredentials: true });
            
            if (itemToRename.type === 'file') {
                setFiles(files.map(f => f.id === itemToRename.id ? { ...f, originalName: newName } : f));
            } else {
                setFolders(folders.map(f => f.id === itemToRename.id ? { ...f, name: newName } : f));
                window.dispatchEvent(new CustomEvent('folderUpdate'));
            }
            
            setRenameModalOpen(false);
            setItemToRename(null);
            setNewName("");
        } catch (err: any) {
             const message = err.response?.data?.message || err.message;
             console.error("Failed to rename:", err);
             // Use a more elegant notification if possible, otherwise alert
             alert(`${t("common.updateFailed")}: ${message}`);
        }
    };

    // Handle Create Link
    const confirmCreateLink = (id: string) => {
        setLinkFileId(id);
        setCreateLinkModalOpen(true);
    };

    const handleLinkSuccess = async (link: string) => {
        setCreatedLink(link);
        setCreateLinkModalOpen(false);
        setSuccessModalOpen(true);

        // Copy to clipboard automatically
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(link);
        }
    };

    const handleDownload = (id: string) => {
        try {
            const url = `${API}/api/files/${id}/download`;
            // Open in a new tab to let the backend handle the file stream/redirect.
            window.open(url, "_blank");
        } catch (err) {
            console.error("Failed to open download", err);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder') => {
        e.dataTransfer.setData("itemId", id);
        e.dataTransfer.setData("itemType", type);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolderId(null);

        const id = e.dataTransfer.getData("itemId");
        const type = e.dataTransfer.getData("itemType") as 'file' | 'folder';

        // Check if it's an external drop
        if (!id && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const items = await scanItems(e.dataTransfer.items);
            if (items.length > 0) {
                // If dropping on a folder, we upload to that folder
                // This is slightly tricky because isUploadOpen might be already set 
                // but we need to pass a different folderId than folderParam.
                // For now, let's navigate to that folder or just pass it as currentFolderId override.
                // The current UploadModal uses currentFolderId. 
                // Let's just set the initial files and open it, but we need to ensure the ID is correct.
                // Actually, UploadModal takes currentFolderId. Let's make it work.

                // We'll use a temporary state or just pass it to the modal.
                // The simplest way is to update currentFolderId in the modal call.
                // But the modal is already bound to folderParam.

                // Let's improve the logic: if we drop on a folder, we might want to upload INTO it.
                // For simplicity, let's just use the current global drop behavior for now 
                // but if we want to be precise, we'd need another state for "target upload folder".

                setUploadInitialFiles(items);
                // We could navigate, but that's disruptive. 
                // Let's just pass the targetFolderId to the modal eventually.
                // For now, let's stay consistent with the current behavior which is uploading to current directory.
                setIsUploadOpen(true);
                return;
            }
        }

        if (!id || id === targetFolderId || targetFolderId === folderParam) return;

        // Optimistic UI Update: remove the item immediately from the local state
        if (type === 'file') {
            setFiles(prev => prev.filter(f => f.id !== id));
        } else {
            setFolders(prev => prev.filter(f => f.id !== id));
        }

        try {
            const endpoint = type === 'file' ? 'files' : 'folders';
            await axios.patch(`${API}/api/${endpoint}/${id}/move`, { targetFolderId }, { withCredentials: true });

            // Background refresh to ensure consistency without flickering
            fetchItems(true);
            if (type === 'folder') {
                window.dispatchEvent(new CustomEvent('folderUpdate'));
            }
        } catch (err) {
            console.error("Failed to move item:", err);
            // Revert state on error by doing a full refresh
            fetchItems();
        }
    };


    const handleGlobalDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.type === "dragenter" || e.type === "dragover") {
            // Check if dragging files from outside
            if (e.dataTransfer.types.includes("Files")) {
                setGlobalDragActive(true);
            }
        } else if (e.type === "dragleave") {
            // Solo desactivar si el drag sale completamente del contenedor
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX;
                const y = e.clientY;
                const isOutside = x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
                if (isOutside) {
                    setGlobalDragActive(false);
                }
            }
        }
    };

    const handleGlobalDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setGlobalDragActive(false);

        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const items = await scanItems(e.dataTransfer.items);
            setUploadInitialFiles(items);
            setIsUploadOpen(true);
        } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setUploadInitialFiles(Array.from(e.dataTransfer.files));
            setIsUploadOpen(true);
        }
        
        // Limpiar cualquier estado residual del drag
        setTimeout(() => {
            setGlobalDragActive(false);
        }, 100);
    };


    const getFileIcon = (mimeType: string, customClass?: string) => {
        const iconClass = customClass || "w-10 h-10";
        if (mimeType.startsWith('image/')) return <ImageIcon className={`${iconClass} text-blue-500`} />;
        if (mimeType.startsWith('video/')) return <Video className={`${iconClass} text-purple-500`} />;
        if (mimeType.startsWith('audio/')) return <Music className={`${iconClass} text-pink-500`} />;
        if (mimeType.includes('pdf')) return <FileText className={`${iconClass} text-orange-500`} />;
        return <FileText className={`${iconClass} text-muted-foreground/40`} />;
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const filteredFolders = folders.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredFiles = files.filter(f =>
        f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div
            className="relative min-h-[400px] select-none"
            onDragEnter={handleGlobalDrag}
            onDragOver={handleGlobalDrag}
            onDragLeave={handleGlobalDrag}
            onDrop={handleGlobalDrop}
            ref={containerRef}
        >
            {/* Selection Marquee Overlay */}
            {
                selectionBox && (
                    <div
                        className="absolute border border-primary bg-primary/10 pointer-events-none z-40 transition-none"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.endX),
                            top: Math.min(selectionBox.startY, selectionBox.endY),
                            width: Math.abs(selectionBox.startX - selectionBox.endX),
                            height: Math.abs(selectionBox.startY - selectionBox.endY)
                        }}
                    />
                )
            }
            <AnimatePresence>
                {globalDragActive && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 rounded-3xl bg-primary/10 border-4 border-dashed border-primary/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 pointer-events-none"
                    >
                        <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                            <Upload className="w-10 h-10 text-primary animate-bounce" />
                        </div>
                        <h2 className="text-2xl font-bold text-primary tracking-tight">{t("files.dropHere")}</h2>
                        <p className="text-sm font-medium text-primary/60">{t("files.releaseFiles")}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Explorer header (enterprise, sticky) */}
            <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
                <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
                    {path.map((p, i) => (
                        <div
                            key={p.id || 'root'}
                            className={cn(
                                "flex items-center shrink-0 rounded-lg transition-all",
                                dragOverFolderId === p.id && "bg-primary/10 px-1"
                            )}
                            onDragOver={handleDragOver}
                            onDragEnter={() => setDragOverFolderId(p.id)}
                            onDragLeave={() => setDragOverFolderId(null)}
                            onDrop={(e) => handleDrop(e, p.id)}
                        >
                            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 mx-0.5" />}
                            <button
                                onClick={() => navigateBack(i)}
                                className={cn(
                                    "px-2 py-1 rounded-lg text-sm font-semibold transition-colors",
                                    i === path.length - 1 ? "text-foreground cursor-default" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                )}
                            >
                                {p.name}
                            </button>
                        </div>
                    ))}
                </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center rounded-2xl border border-border bg-background p-1">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={cn(
                                        "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                                        viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                    )}
                                    title={t("files.viewGrid")}
                                >
                                    <Grid className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={cn(
                                        "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                                        viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                    )}
                                    title={t("files.viewList")}
                                >
                                    <ListIcon className="h-4 w-4" />
                                </button>
                            </div>

                            <button
                                onClick={() => setCreateFolderOpen(true)}
                                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted/40"
                                title={t("files.newFolder")}
                            >
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">{t("files.newFolder")}</span>
                            </button>

                            <button
                                onClick={() => setIsUploadOpen(true)}
                                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background hover:opacity-95"
                            >
                                <Upload className="h-4 w-4" />
                                <span>{t("files.upload")}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {
                loading ? (
                    <div className="px-4 py-6 sm:px-6">
                        <div className="space-y-4">
                        {viewMode === "list" ? (
                            <div className="overflow-hidden rounded-2xl border border-border bg-background">
                                <div className="grid grid-cols-[1fr_120px_140px_140px] gap-4 px-6 py-4 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30">
                                     <span>{t("files.name")}</span>
                                    <span>{t("files.size")}</span>
                                    <span>{t("files.modified")}</span>
                                    <span className="text-right">{t("files.options")}</span>
                                </div>
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_120px_140px_140px] gap-4 px-6 py-4 items-center border-b border-border last:border-0">
                                        <div className="flex items-center gap-4">
                                            <Skeleton className="w-10 h-10 rounded-xl" />
                                            <Skeleton className="h-4 w-32" />
                                        </div>
                                        <Skeleton className="h-3 w-16" />
                                        <Skeleton className="h-3 w-24" />
                                        <div className="flex justify-end">
                                            <Skeleton className="w-8 h-8 rounded-lg" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-6">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="rounded-2xl border border-border bg-background overflow-hidden">
                                        <Skeleton className="w-full aspect-square" />
                                        <div className="w-full px-3 py-4 space-y-2">
                                            <Skeleton className="h-4 w-3/4 mx-auto" />
                                            <Skeleton className="h-3 w-1/2 mx-auto" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                    </div>
                ) : files.length === 0 && folders.length === 0 ? (
                    <div className="px-4 py-20 text-center sm:px-6">
                        <div className="w-24 h-24 rounded-[2.5rem] bg-muted/40 flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <FolderIcon className="w-12 h-12 text-muted-foreground/20" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground tracking-tight">{t("files.emptyFolder.title")}</h3>
                        <p className="text-muted-foreground text-sm mt-3 max-w-[280px] mx-auto leading-relaxed font-medium">{t("files.emptyFolder.subtitle")}</p>
                    </div>
                ) : (
                    <div className="px-4 py-6 sm:px-6">
                        {/* Items Rendering */}
                        {viewMode === "list" ? (
                            <div className="overflow-hidden rounded-2xl border border-border bg-background selection-zone">
                                <div className="grid grid-cols-[40px_1fr_115px] sm:grid-cols-[40px_1fr_120px_120px] lg:grid-cols-[40px_1fr_120px_140px_140px] gap-2 sm:gap-4 px-4 sm:px-6 py-4 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 selection-zone">
                                    <div
                                        onClick={() => {
                                            if (selectedItems.length === (filteredFiles.length + filteredFolders.length)) {
                                                setSelectedItems([]);
                                            } else {
                                                setSelectedItems([
                                                    ...filteredFolders.map(f => ({ id: f.id, type: 'folder' as const })),
                                                    ...filteredFiles.map(f => ({ id: f.id, type: 'file' as const }))
                                                ]);
                                            }
                                        }}
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all mt-0.5",
                                            selectedItems.length > 0 && selectedItems.length === (filteredFiles.length + filteredFolders.length)
                                                ? "bg-primary border-primary text-white"
                                                : "border-muted-foreground/40 hover:border-primary/40"
                                        )}
                                    >
                                        {selectedItems.length > 0 && <CheckCircle className="w-3 h-3" />}
                                    </div>
                                    <span>{t("files.name")}</span>
                                    <span className="hidden sm:block">{t("files.size")}</span>
                                    <span className="hidden lg:block">{t("files.modified")}</span>
                                    <span className="text-right pr-4 sm:pr-0">{t("files.options")}</span>
                                </div>
                                {filteredFolders.map(folder => (
                                    <div
                                        key={folder.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, folder.id, 'folder')}
                                        onDragOver={handleDragOver}
                                        onDragEnter={() => setDragOverFolderId(folder.id)}
                                        onDragLeave={() => setDragOverFolderId(null)}
                                        onDrop={(e) => handleDrop(e, folder.id)}
                                        className={cn(
                                            "grid grid-cols-[40px_1fr_80px_80px] sm:grid-cols-[40px_1fr_100px_100px_100px] gap-2 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 items-center border-b border-border last:border-0 hover:bg-muted/30 transition-colors group cursor-default",
                                            dragOverFolderId === folder.id && "bg-primary/5",
                                            selectedItems.find(i => i.id === folder.id) && "bg-primary/5"
                                        )}
                                        ref={(el) => { if (el) itemRefs.current.set(folder.id, el); else itemRefs.current.delete(folder.id); }}
                                        onDoubleClick={() => navigateToFolder(folder)}
                                    >
                                        <div className="flex items-center justify-center" onClick={(e) => toggleItemSelection(folder.id, 'folder', e)}>
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                                selectedItems.find(i => i.id === folder.id)
                                                    ? "bg-primary border-primary text-white"
                                                    : "border-muted-foreground/40 hover:border-primary/40 group-hover:opacity-100 sm:opacity-0"
                                            )}>
                                                {selectedItems.find(i => i.id === folder.id) && <CheckCircle className="w-3 h-3" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-primary/5 rounded-lg text-primary">
                                                <FolderIcon className="w-4 h-4 fill-current/10" />
                                            </div>
                                            <span className="text-sm text-foreground truncate font-medium">{folder.name}</span>
                                        </div>
                                        <span className="hidden sm:block text-xs text-muted-foreground">{t("common.folder")}</span>
                                        <span className="hidden lg:block text-[11px] text-muted-foreground">{new Date(folder.createdAt).toLocaleDateString()}</span>
                                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); navigateToFolder(folder); }} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title={t("common.open")}>
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                            {canRename && (
                                                <button onClick={(e) => { e.stopPropagation(); confirmRename(folder.id, folder.name, 'folder'); }} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors" title={t("common.rename")}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button onClick={(e) => { e.stopPropagation(); confirmDelete(folder.id, folder.name, 'folder'); }} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t("common.delete")}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {filteredFiles.map(file => (
                                    <div
                                        key={file.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, file.id, 'file')}
                                        className={cn(
                                            "grid grid-cols-[40px_1fr_80px_80px] sm:grid-cols-[40px_1fr_100px_100px_100px] gap-2 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 items-center border-b border-border last:border-0 hover:bg-muted/30 transition-colors group cursor-pointer",
                                            selectedFile === file.id && "bg-accent/40",
                                            selectedItems.find(i => i.id === file.id) && "bg-primary/5"
                                        )}
                                        ref={(el) => { if (el) itemRefs.current.set(file.id, el); else itemRefs.current.delete(file.id); }}
                                        onClick={() => setPreviewFile(file)}
                                    >
                                        <div className="flex items-center justify-center" onClick={(e) => toggleItemSelection(file.id, 'file', e)}>
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                                selectedItems.find(i => i.id === file.id)
                                                    ? "bg-primary border-primary text-white"
                                                    : "border-muted-foreground/40 hover:border-primary/40 group-hover:opacity-100 sm:opacity-0"
                                            )}>
                                                {selectedItems.find(i => i.id === file.id) && <CheckCircle className="w-3 h-3" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-0">
                                            {previews[file.id] && file.mimeType.startsWith('image/') ? (
                                                <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm border border-border/40 shrink-0">
                                                    <img src={previews[file.id]} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            ) : previews[file.id] && file.mimeType.startsWith('video/') ? (
                                                <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm border border-border/40 flex items-center justify-center bg-black shrink-0">
                                                    <video src={previews[file.id]} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-muted/60 rounded-lg">
                                                    {getFileIcon(file.mimeType, "w-4 h-4")}
                                                </div>
                                            )}
                                            <span className="text-sm text-foreground truncate font-medium">{file.originalName}</span>
                                        </div>
                                        <span className="hidden sm:block text-xs text-muted-foreground">{formatSize(file.size)}</span>
                                        <span className="hidden lg:block text-[11px] text-muted-foreground">{new Date(file.createdAt).toLocaleDateString()}</span>
                                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); handleDownload(file.id); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Download">
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); confirmCreateLink(file.id); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Share">
                                                <LinkIcon className="w-3.5 h-3.5" />
                                            </button>
                                            {canRename && (
                                                <button onClick={(e) => { e.stopPropagation(); confirmRename(file.id, file.originalName, 'file'); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title={t("common.rename")}>
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button onClick={(e) => { e.stopPropagation(); confirmDelete(file.id, file.originalName, 'file'); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors" title={t("common.delete")}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Grid View
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 selection-zone">
                                {filteredFolders.map(folder => (
                                    <motion.div
                                        key={folder.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, folder.id, 'folder')}
                                        onDragOver={handleDragOver}
                                        onDragEnter={() => setDragOverFolderId(folder.id)}
                                        onDragLeave={() => setDragOverFolderId(null)}
                                        onDrop={(e) => handleDrop(e, folder.id)}
                                        whileDrag={{ scale: 1.05, opacity: 0.8, rotate: -2 }}
                                        className={cn(
                                            "group cursor-default notion-card flex flex-col items-center p-0 relative overflow-hidden",
                                            dragOverFolderId === folder.id && "ring-2 ring-primary bg-primary/5 scale-105",
                                            selectedItems.find(i => i.id === folder.id) && "ring-2 ring-primary/40 bg-primary/5"
                                        )}
                                        ref={(el) => { if (el) itemRefs.current.set(folder.id, el); else itemRefs.current.delete(folder.id); }}
                                        onClick={() => navigateToFolder(folder)}
                                    >
                                        {/* Grid Checkbox: visible on mobile, hover on desktop */}
                                        <div
                                            onClick={(e) => toggleItemSelection(folder.id, 'folder', e)}
                                            className={cn(
                                                "absolute top-3 left-3 z-20 transition-all",
                                                selectedItems.find(i => i.id === folder.id)
                                                    ? "w-6 h-6 rounded-full bg-primary border-primary text-white flex items-center justify-center shadow-lg"
                                                    : "w-6 h-6 rounded-full bg-white/90 dark:bg-background/90 border-2 border-white dark:border-border opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-hover:border-primary/40 shadow-sm"
                                            )}
                                        >
                                            {selectedItems.find(i => i.id === folder.id) && <CheckCircle className="w-4 h-4" />}
                                        </div>
                                        
                                        {/* Folder Preview Area */}
                                        <div className="w-full aspect-[4/3] relative overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center group-hover:from-primary/10 group-hover:to-primary/15 transition-colors">
                                            <FolderIcon className="w-20 h-20 text-primary/40 fill-primary/10 transition-transform duration-500 group-hover:scale-110" />

                                            {/* Folder Badge */}
                                            <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-primary/80 backdrop-blur-sm text-white text-[10px] font-semibold uppercase tracking-wider">
                                                {t("common.folder")}
                                            </div>

                                            {/* Actions Overlay */}
                                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); navigateToFolder(folder); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-white text-primary transition-colors touch-manipulation" title="Open">
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                    {canRename && (
                                                        <button onClick={(e) => { e.stopPropagation(); confirmRename(folder.id, folder.name, 'folder'); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-white text-foreground transition-colors touch-manipulation" title={t("common.rename")}>
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={(e) => { e.stopPropagation(); confirmDelete(folder.id, folder.name, 'folder'); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-red-50 text-red-500 transition-colors touch-manipulation" title="Delete">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Folder Info */}
                                        <div className="w-full p-3 bg-background/80 backdrop-blur-sm">
                                            <h3 className="text-[12px] sm:text-[13px] font-semibold text-foreground truncate w-full mb-1">{folder.name}</h3>
                                            <p className="text-[9px] text-muted-foreground/60">{new Date(folder.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </motion.div>
                                ))}
                                {filteredFiles.map(file => (
                                    <motion.div
                                        key={file.id}
                                        draggable
                                        onDragStart={(e: any) => handleDragStart(e, file.id, 'file')}
                                        onDrop={(e: any) => handleDrop(e, null)}
                                        whileDrag={{ scale: 1.05, opacity: 0.8, rotate: -2 }}
                                        className={cn(
                                            "group cursor-default notion-card flex flex-col items-center p-0 relative overflow-hidden",
                                            selectedFile === file.id && "ring-4 ring-primary/5 border-primary/40 shadow-xl",
                                            selectedItems.find(i => i.id === file.id) && "ring-2 ring-primary/40 bg-primary/5"
                                        )}
                                        ref={(el) => { if (el) itemRefs.current.set(file.id, el); else itemRefs.current.delete(file.id); }}
                                        onClick={() => setPreviewFile(file)}
                                    >
                                        {/* Grid Checkbox Overlay */}
                                        <div
                                            onClick={(e) => toggleItemSelection(file.id, 'file', e)}
                                            className={cn(
                                                "absolute top-3 left-3 z-20 transition-all",
                                                selectedItems.find(i => i.id === file.id)
                                                    ? "w-6 h-6 rounded-full bg-primary border-primary text-white flex items-center justify-center shadow-lg"
                                                    : "w-6 h-6 rounded-full bg-white/90 dark:bg-background/90 border-2 border-white dark:border-border opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-hover:border-primary/40 shadow-sm"
                                            )}
                                        >
                                            {selectedItems.find(i => i.id === file.id) && <CheckCircle className="w-4 h-4" />}
                                        </div>
                                        
                                        {/* Preview Area - Improved */}
                                        <div className="w-full aspect-[4/3] relative overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10">
                                            {loadingPreviews[file.id] ? (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="relative">
                                                        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-4 h-4 bg-primary/20 rounded-full animate-pulse"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : previews[file.id] && file.mimeType.startsWith('image/') ? (
                                                <img src={previews[file.id]} alt={file.originalName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onLoad={() => setLoadingPreviews(prev => ({ ...prev, [file.id]: false }))} />
                                            ) : previews[file.id] && file.mimeType.startsWith('video/') ? (
                                                <video src={previews[file.id]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" muted playsInline preload="metadata" onLoadedData={() => setLoadingPreviews(prev => ({ ...prev, [file.id]: false }))} />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/60 group-hover:text-primary transition-colors">
                                                        {getFileIcon(file.mimeType, "w-10 h-10")}
                                                    </div>
                                                </div>
                                            )}

                                            {/* File Type Badge */}
                                            <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold uppercase tracking-wider">
                                                {file.mimeType.split('/')[1]?.slice(0, 4) || 'FILE'}
                                            </div>

                                            {/* Actions Overlay - Always visible on mobile, hover on desktop */}
                                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownload(file.id); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-white text-foreground transition-colors touch-manipulation" title="Download">
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); confirmCreateLink(file.id); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-white text-primary transition-colors touch-manipulation" title="Share">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
                                                    {canRename && (
                                                        <button onClick={(e) => { e.stopPropagation(); confirmRename(file.id, file.originalName, 'file'); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-white text-foreground transition-colors touch-manipulation" title={t("common.rename")}>
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={(e) => { e.stopPropagation(); confirmDelete(file.id, file.originalName, 'file'); }} className="p-2.5 bg-white/90 dark:bg-background/90 rounded-xl shadow-lg hover:bg-red-50 text-red-500 transition-colors touch-manipulation" title="Delete">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* File Info */}
                                        <div className="w-full p-3 bg-background/80 backdrop-blur-sm">
                                            <h3 className="text-[12px] sm:text-[13px] font-semibold text-foreground truncate w-full mb-1">{file.originalName}</h3>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] text-muted-foreground font-medium">{formatSize(file.size)}</p>
                                                <p className="text-[9px] text-muted-foreground/60">{new Date(file.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Modals */}
            {
                previewFile && (
                    <PreviewModal
                        isOpen={!!previewFile}
                        file={previewFile}
                        onClose={() => {
                            setPreviewFile(null);
                            if (previewParam) {
                                const newParams = new URLSearchParams(searchParams.toString());
                                newParams.delete('preview');
                                router.push(`/dashboard/files?${newParams.toString()}`);
                            }
                        }}
                    />
                )
            }
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => { setDeleteModalOpen(false); setDeleteProgress(null); setDeleteError(null); }}
                title={t("common.renameItem").replace("{type}", itemToDelete?.type === 'file' ? t("common.itemType.file") : t("common.itemType.folder"))}
            >
                <div className="space-y-4">
                    {deleteProgress && !deleteError ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    {deleteProgress.current === deleteProgress.total ? (
                                        <Check className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">
                                        {deleteProgress.current === deleteProgress.total 
                                            ? "Eliminado correctamente"
                                            : "Eliminando..."
                                        }
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{deleteProgress.item}</p>
                                </div>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    className="h-full bg-primary rounded-full"
                                />
                            </div>
                        </div>
                    ) : deleteError ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <X className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-red-500">Error</p>
                                    <p className="text-xs text-muted-foreground">{deleteError}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground font-medium">
                                {t("common.confirmDelete").replace("{name}", itemToDelete?.name || "")}
                                {itemToDelete?.type === 'folder' && t("common.folderDeleteWarning")}
                                {t("common.irreversibleAction")}
                            </p>
                        </>
                    )}
                    <ModalFooter>
                        <Button 
                            variant="ghost" 
                            className="rounded-xl" 
                            onClick={() => { setDeleteModalOpen(false); setDeleteProgress(null); setDeleteError(null); }}
                            disabled={!!deleteProgress && deleteProgress.current !== deleteProgress.total}
                        >
                            {deleteProgress?.current === deleteProgress?.total ? "Cerrar" : t("common.cancel")}
                        </Button>
                        {!deleteError && !deleteProgress?.current && (
                            <Button 
                                variant="destructive" 
                                className="rounded-xl" 
                                onClick={handleDelete}
                            >
                                {t("common.deletePermanently")}
                            </Button>
                        )}
                    </ModalFooter>
                </div>
            </Modal>

            {/* Rename Modal */}
            <Modal
                isOpen={renameModalOpen}
                onClose={() => setRenameModalOpen(false)}
                title={t("common.renameItem").replace("{type}", itemToRename?.type === 'file' ? t("common.itemType.file") : t("common.itemType.folder"))}
            >
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            {itemToRename?.type === 'file' ? <FileIcon className="w-6 h-6" /> : <FolderIcon className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{itemToRename?.type === 'file' ? t("files.currentName") : t("files.currentName")}</p>
                            <p className="text-sm font-semibold text-foreground truncate">{itemToRename?.name}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">{t("common.newName")}</label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                                className="w-full bg-muted/30 p-4 pl-12 rounded-2xl border border-border/60 focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all font-medium text-foreground"
                                placeholder={t("common.enterNewName")}
                                autoFocus
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                                <Edit2 className="w-5 h-5" />
                            </div>
                        </div>
                    </div>

                    <ModalFooter className="pt-2">
                        <Button 
                            variant="ghost" 
                            className="rounded-xl h-12 px-6 font-bold" 
                            onClick={() => setRenameModalOpen(false)}
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button 
                            className="rounded-xl px-8 h-12 font-bold shadow-lg shadow-primary/20" 
                            onClick={handleRename}
                            disabled={!newName.trim() || newName === itemToRename?.name}
                        >
                            {t("common.saveChanges")}
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Link Success Modal */}
            <Modal isOpen={successModalOpen} onClose={() => setSuccessModalOpen(false)} title={t("share.success.title")}>
                <div className="space-y-6">
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                        {t("share.success.subtitle")}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={createdLink}
                            className="flex-1 bg-muted/60 border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground font-mono select-all focus:outline-none focus:border-primary/40 focus:bg-background transition-all"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(createdLink);
                            }}
                            className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all shrink-0 shadow-sm shadow-primary/5"
                            title={t("common.copyAgain")}
                        >
                            <Copy className="w-5 h-5" />
                        </button>
                    </div>
                    <ModalFooter>
                        <Button className="rounded-xl w-full h-11 font-bold" onClick={() => setSuccessModalOpen(false)}>{t("common.done")}</Button>
                    </ModalFooter>
                </div>
            </Modal>

            {/* Advanced Link Creation Modal */}
            {
                linkFileId && (
                    <CreateLinkModal
                        isOpen={createLinkModalOpen}
                        onClose={() => setCreateLinkModalOpen(false)}
                        fileId={linkFileId}
                        onSuccess={handleLinkSuccess}
                    />
                )
            }


            {/* Bulk Actions Floating Bar */}
            {mounted && createPortal(
                <AnimatePresence>
                    {selectedItems.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, x: "-50%" }}
                            animate={{ opacity: 1, y: 0, x: "-50%" }}
                            exit={{ opacity: 0, y: 50, x: "-50%" }}
                            className="fixed bottom-6 left-1/2 z-[10000] px-6 py-3 bg-background/80 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl flex items-center gap-6"
                        >
                            <div className="flex items-center gap-2 border-r border-border/40 pr-6 mr-2">
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    {selectedItems.length}
                                </span>
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{t("common.selected")}</span>
                            </div>

                            <div className="flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBulkDelete}
                                    className="h-9 px-4 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-widest">{t("common.delete")}</span>
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedItems([])}
                                    className="h-9 px-4 rounded-xl transition-all font-bold uppercase tracking-widest text-[11px]"
                                >
                                    {t("common.cancel")}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <CreateFolderModal
                isOpen={createFolderOpen}
                onClose={() => setCreateFolderOpen(false)}
                currentFolderId={folderParam}
                onSuccess={fetchItems}
            />

            <UploadModal
                isOpen={isUploadOpen}
                onClose={() => {
                    setIsUploadOpen(false);
                    setUploadInitialFiles([]);
                }}
                onUploadComplete={fetchItems}
                currentFolderId={folderParam}
                initialFiles={uploadInitialFiles}
            />

            {/* UploadProgress is rendered globally in dashboard layout */}
        </div >

    );
}
