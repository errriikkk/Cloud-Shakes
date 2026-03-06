"use client";

import { useState, useCallback } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AlertModal } from "@/components/AlertModal";

export function useModal() {
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type?: 'danger' | 'warning' | 'info' | 'success';
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({
        isOpen: false,
        title: '',
        message: '',
    });

    const [alertState, setAlertState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type?: 'danger' | 'warning' | 'info' | 'success';
        buttonText?: string;
        onClose?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
    });

    const confirm = useCallback((
        title: string,
        message: string,
        options?: {
            type?: 'danger' | 'warning' | 'info' | 'success';
            confirmText?: string;
            cancelText?: string;
        }
    ): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({
                isOpen: true,
                title,
                message,
                type: options?.type || 'warning',
                confirmText: options?.confirmText,
                cancelText: options?.cancelText,
                onConfirm: () => {
                    setConfirmState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
            });
        });
    }, []);

    const alert = useCallback((
        title: string,
        message: string,
        options?: {
            type?: 'danger' | 'warning' | 'info' | 'success';
            buttonText?: string;
        }
    ): Promise<void> => {
        return new Promise((resolve) => {
            setAlertState({
                isOpen: true,
                title,
                message,
                type: options?.type || 'info',
                buttonText: options?.buttonText,
                onClose: () => {
                    setAlertState(prev => ({ ...prev, isOpen: false, onClose: undefined }));
                    resolve();
                },
            });
        });
    }, []);

    const closeConfirm = useCallback(() => {
        setConfirmState(prev => ({ ...prev, isOpen: false, onConfirm: undefined }));
    }, []);

    const closeAlert = useCallback(() => {
        setAlertState(prev => {
            prev.onClose?.();
            return { ...prev, isOpen: false, onClose: undefined };
        });
    }, []);

    const ModalComponents = () => (
        <>
            <ConfirmModal
                isOpen={confirmState.isOpen}
                onClose={closeConfirm}
                onConfirm={() => {
                    confirmState.onConfirm?.();
                }}
                title={confirmState.title}
                message={confirmState.message}
                type={confirmState.type}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
            />
            <AlertModal
                isOpen={alertState.isOpen}
                onClose={closeAlert}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                buttonText={alertState.buttonText}
            />
        </>
    );

    return { confirm, alert, ModalComponents };
}

