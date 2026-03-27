"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { ScannedFile } from '@/lib/fileScanner';

interface UploadItem {
    id: string;
    file: File;
    path: string;
    status: 'waiting' | 'creating_folders' | 'uploading' | 'completed' | 'error';
    progress: number;
    error?: string;
}

interface UploadContextType {
    uploads: UploadItem[];
    addUploads: (items: ScannedFile[], targetFolderId: string | null) => void;
    clearCompleted: () => void;
    clearAll: () => void;
    retryFailed: () => void;
    isUploading: boolean;
    totalProgress: number;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUploads = () => {
    const context = useContext(UploadContext);
    if (!context) throw new Error('useUploads must be used within an UploadProvider');
    return context;
};

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const processingRef = useRef(false);
    const queueRef = useRef<UploadItem[]>([]);

    const isUploading = uploads.some(u => u.status === 'uploading' || u.status === 'creating_folders');

    const totalProgress = uploads.length > 0
        ? Math.round(uploads.reduce((acc, curr) => acc + curr.progress, 0) / uploads.length)
        : 0;

    const addUploads = useCallback(async (items: ScannedFile[], targetFolderId: string | null) => {
        const newUploads: UploadItem[] = items.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            file: item.file,
            path: item.path,
            status: 'waiting',
            progress: 0
        }));

        setUploads(prev => [...prev, ...newUploads]);
        
        // Add to queue
        queueRef.current = [...queueRef.current, ...newUploads];
        
        // Start processing if not already
        if (!processingRef.current) {
            processQueue(targetFolderId);
        }
    }, []);

    const retryFailed = useCallback(() => {
        const failedItems = uploads.filter(u => u.status === 'error');
        if (failedItems.length > 0) {
            setUploads(prev => prev.map(u => 
                u.status === 'error' ? { ...u, status: 'waiting' as const, progress: 0, error: undefined } : u
            ));
            queueRef.current = [...queueRef.current, ...failedItems];
            if (!processingRef.current) {
                processQueue(null);
            }
        }
    }, [uploads]);

    const clearAll = useCallback(() => {
        setUploads([]);
        queueRef.current = [];
    }, []);

    const processQueue = async (initialFolderId: string | null) => {
        if (processingRef.current && queueRef.current.length === 0) return;
        processingRef.current = true;

        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const folderCache: Record<string, string> = {};

        const updateStatus = (id: string, status: UploadItem['status'], progress: number = 0, error?: string) => {
            setUploads(prev => prev.map(u => u.id === id ? { ...u, status, progress, error } : u));
        };

        const updateBatchStatus = (ids: string[], status: UploadItem['status']) => {
            setUploads(prev => prev.map(u => ids.includes(u.id) ? { ...u, status } : u));
        };

        try {
            while (queueRef.current.length > 0) {
                // Get next batch of waiting items
                const batch = queueRef.current.filter(u => u.status === 'waiting').slice(0, 10);
                if (batch.length === 0) break;

                // Stage 1: Create folders for this batch
                const pathsWithFolders = batch.filter(item => item.path);
                if (pathsWithFolders.length > 0) {
                    const uniquePaths = Array.from(new Set(pathsWithFolders.map(item => item.path)));
                    uniquePaths.sort((a, b) => a.split('/').length - b.split('/').length);

                    for (const path of uniquePaths) {
                        const segments = path.split('/');
                        let parentId = initialFolderId;
                        let currentPath = "";

                        for (const segment of segments) {
                            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
                            if (folderCache[currentPath]) {
                                parentId = folderCache[currentPath];
                                continue;
                            }

                            try {
                                const idsInPath = batch.filter(item => item.path?.startsWith(currentPath)).map(i => i.id);
                                if (idsInPath.length > 0) {
                                    updateBatchStatus(idsInPath, 'creating_folders');
                                }

                                const res = await axios.post(`${API_URL}/api/folders`, {
                                    name: segment,
                                    parentId: parentId
                                }, { withCredentials: true });

                                folderCache[currentPath] = res.data.id;
                                parentId = res.data.id;
                            } catch (err) {
                                console.error("Folder creation failed for", currentPath, err);
                            }
                        }
                    }
                }

                // Stage 2: Upload files in this batch (with concurrency)
                const CONCURRENCY = 3;
                const uploadQueue = [...batch];

                const worker = async () => {
                    while (uploadQueue.length > 0) {
                        const item = uploadQueue.shift();
                        if (!item || item.status !== 'waiting') continue;

                        try {
                            updateStatus(item.id, 'uploading', 0);
                            const formData = new FormData();
                            formData.append("file", item.file);

                            const targetId = item.path ? folderCache[item.path] : initialFolderId;
                            if (targetId) {
                                formData.append("folderId", targetId);
                            }

                            await axios.post(`${API_URL}/api/files/upload`, formData, {
                                withCredentials: true,
                                onUploadProgress: (progressEvent) => {
                                    const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
                                    updateStatus(item.id, 'uploading', percent);
                                }
                            });

                            updateStatus(item.id, 'completed', 100);
                        } catch (err: any) {
                            console.error("Upload failed for", item.file.name, err);
                            updateStatus(item.id, 'error', 0, err.response?.data?.message || err.message || 'Upload failed');
                            // Don't remove from queueRef - mark as done so we don't retry automatically
                        }
                        
                        // Remove from queueRef
                        queueRef.current = queueRef.current.filter(u => u.id !== item.id);
                    }
                };

                await Promise.all(Array(CONCURRENCY).fill(null).map(worker));
                
                // Remove processed items from queueRef
                queueRef.current = queueRef.current.filter(u => !batch.some(b => b.id === u.id));
            }

            // Trigger a refresh event
            window.dispatchEvent(new CustomEvent('uploadComplete'));

        } catch (err) {
            console.error("Queue processing failed", err);
        } finally {
            processingRef.current = false;
            // Check if there are more items waiting
            if (queueRef.current.some(u => u.status === 'waiting')) {
                processQueue(initialFolderId);
            }
        }
    };

    const clearCompleted = useCallback(() => {
        setUploads(prev => prev.filter(u => u.status !== 'completed' && u.status !== 'error'));
    }, []);

    return (
        <UploadContext.Provider value={{ uploads, addUploads, clearCompleted, clearAll, retryFailed, isUploading, totalProgress }}>
            {children}
        </UploadContext.Provider>
    );
};
