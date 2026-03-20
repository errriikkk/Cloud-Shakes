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

    const isUploading = uploads.some(u => u.status !== 'completed' && u.status !== 'error');

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
        processQueue(newUploads, targetFolderId);
    }, []);

    const processQueue = async (newItems: UploadItem[], currentFolderId: string | null) => {
        if (processingRef.current) return;
        processingRef.current = true;
        // Note: In a real app we might want to handle multiple queues. 
        // For simplicity, we process the batch.

        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const folderCache: Record<string, string> = {};

        const updateStatus = (id: string, status: UploadItem['status'], progress: number = 0, error?: string) => {
            setUploads(prev => prev.map(u => u.id === id ? { ...u, status, progress, error } : u));
        };

        try {
            // Stage 1: Group and Create Folders
            // Collect unique paths
            const uniquePaths = Array.from(new Set(newItems.map(item => item.path).filter(p => !!p)));
            // Sort by depth
            uniquePaths.sort((a, b) => a.split('/').length - b.split('/').length);

            for (const path of uniquePaths) {
                const segments = path.split('/');
                let parentId = currentFolderId;
                let currentPath = "";

                for (const segment of segments) {
                    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
                    if (folderCache[currentPath]) {
                        parentId = folderCache[currentPath];
                        continue;
                    }

                    try {
                        // Mark all files in this path as 'creating_folders'
                        newItems.forEach(item => {
                            if (item.path.startsWith(currentPath)) {
                                updateStatus(item.id, 'creating_folders');
                            }
                        });

                        const res = await axios.post(`${API_URL}/api/folders`, {
                            name: segment,
                            parentId: parentId
                        }, { withCredentials: true });

                        folderCache[currentPath] = res.data.id;
                        parentId = res.data.id;
                    } catch (err) {
                        console.error("Folder creation failed", err);
                        // We might decide to fail the files in this path
                    }
                }
            }

            // Stage 2: Upload Files (with concurrency)
            const CONCURRENCY = 3;
            const queue = [...newItems];

            const worker = async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (!item) break;

                    try {
                        updateStatus(item.id, 'uploading', 0);
                        const formData = new FormData();
                        formData.append("file", item.file);

                        const targetId = item.path ? folderCache[item.path] : currentFolderId;
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
                        updateStatus(item.id, 'error', 0, err.message || 'Upload failed');
                    }
                }
            };

            await Promise.all(Array(CONCURRENCY).fill(null).map(worker));

            // Trigger a refresh event if needed
            window.dispatchEvent(new CustomEvent('uploadComplete'));

        } catch (err) {
            console.error("Queue processing failed", err);
        } finally {
            processingRef.current = false;
        }
    };

    const clearCompleted = useCallback(() => {
        setUploads(prev => prev.filter(u => u.status !== 'completed' && u.status !== 'error'));
    }, []);

    return (
        <UploadContext.Provider value={{ uploads, addUploads, clearCompleted, isUploading, totalProgress }}>
            {children}
        </UploadContext.Provider>
    );
};
