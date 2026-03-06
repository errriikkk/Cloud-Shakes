"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    buttonText?: string;
}

export function AlertModal({
    isOpen,
    onClose,
    title,
    message,
    type = 'info',
    buttonText = 'Aceptar'
}: AlertModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, [isOpen]);

    if (!mounted || !isOpen) return null;

    const iconMap = {
        danger: AlertTriangle,
        warning: AlertTriangle,
        info: Info,
        success: CheckCircle2,
    };

    const colorMap = {
        danger: 'text-red-500 bg-red-50',
        warning: 'text-amber-500 bg-amber-50',
        info: 'text-blue-500 bg-blue-50',
        success: 'text-green-500 bg-green-50',
    };

    const Icon = iconMap[type];

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - Full screen coverage */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
                        onClick={onClose}
                        style={{
                            margin: 0,
                            padding: 0,
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100vw',
                            height: '100vh',
                        }}
                    />
                    {/* Modal Container - Centered on screen */}
                    <div 
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
                        style={{
                            margin: 0,
                            padding: '1rem',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100vw',
                            height: '100vh',
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border-2 border-gray-200 overflow-hidden pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-6">
                                <div className={cn(
                                    "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                    colorMap[type]
                                )}>
                                    <Icon className="w-7 h-7" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                                    <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                                >
                                    <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex justify-end bg-gray-50">
                            <Button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl font-bold shadow-md bg-primary hover:bg-primary/90 text-white"
                            >
                                {buttonText}
                            </Button>
                        </div>
                    </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}

