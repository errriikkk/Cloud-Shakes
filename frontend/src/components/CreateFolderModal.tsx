"use client";

import { useState } from "react";
import { Modal, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import axios from "axios";

interface CreateFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentFolderId: string | null;
    onSuccess: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function CreateFolderModal({ isOpen, onClose, currentFolderId, onSuccess }: CreateFolderModalProps) {
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            await axios.post(`${API}/api/folders`, {
                name: name.trim(),
                parentId: currentFolderId
            }, { withCredentials: true });
            setName("");
            onSuccess();
            window.dispatchEvent(new CustomEvent('folderUpdate'));
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nueva Carpeta">
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Nombre de la Carpeta</p>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Proyecto X"
                        className="notion-input w-full"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-xl">Cancelar</Button>
                    <Button onClick={handleCreate} disabled={!name.trim() || loading} className="rounded-xl px-8">Crear</Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}
