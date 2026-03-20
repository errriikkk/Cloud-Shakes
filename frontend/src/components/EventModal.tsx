"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Calendar as CalIcon, Clock, Tag, Pin, Trash2, Save, Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => void;
    onDelete?: (id: string) => void;
    initialData?: any;
    selectedDate?: Date | null;
}

const COLORS = [
    { name: "primary", value: "bg-primary text-primary-foreground" },
    { name: "blue", value: "bg-blue-500 text-white" },
    { name: "green", value: "bg-emerald-500 text-white" },
    { name: "yellow", value: "bg-amber-500 text-white" },
    { name: "red", value: "bg-rose-500 text-white" },
    { name: "purple", value: "bg-violet-500 text-white" },
];

export function EventModal({ isOpen, onClose, onSave, onDelete, initialData, selectedDate }: EventModalProps) {
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startDate, setStartDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endDate, setEndDate] = useState("");
    const [endTime, setEndTime] = useState("");
    const [allDay, setAllDay] = useState(true);
    const [pinned, setPinned] = useState(false);
    const [color, setColor] = useState("primary");
    const [reminderMinutes, setReminderMinutes] = useState<number | null>(15); // Default 15 minutes

    useEffect(() => {
        setMounted(true);
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => {
            window.removeEventListener('resize', checkMobile);
            setMounted(false);
        };
    }, []);

    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title || "");
            setDescription(initialData.description || "");
            const start = initialData.startDate ? new Date(initialData.startDate) : new Date();
            setStartDate(start.toISOString().split('T')[0]);
            setStartTime(initialData.allDay ? "" : start.toTimeString().slice(0, 5));
            if (initialData.endDate) {
                const end = new Date(initialData.endDate);
                setEndDate(end.toISOString().split('T')[0]);
                setEndTime(initialData.allDay ? "" : end.toTimeString().slice(0, 5));
            } else {
                setEndDate("");
                setEndTime("");
            }
            setAllDay(initialData.allDay ?? true);
            setPinned(initialData.pinned ?? false);
            setColor(initialData.color || "primary");
            setReminderMinutes(initialData.reminderMinutes !== undefined ? initialData.reminderMinutes : 15);
        } else if (selectedDate) {
            setTitle("");
            setDescription("");
            const dateStr = selectedDate.toISOString().split('T')[0];
            setStartDate(dateStr);
            setStartTime("");
            setEndDate(dateStr);
            setEndTime("");
            setAllDay(true);
            setPinned(false);
            setColor("primary");
            setReminderMinutes(15);
        }
    }, [initialData, selectedDate, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Build start date with time if not all day
        let startDateTime = new Date(startDate);
        if (!allDay && startTime) {
            const [hours, minutes] = startTime.split(':');
            startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        } else {
            startDateTime.setHours(0, 0, 0, 0);
        }
        
        // Build end date with time if not all day
        let endDateTime: Date | null = null;
        if (endDate) {
            endDateTime = new Date(endDate);
            if (!allDay && endTime) {
                const [hours, minutes] = endTime.split(':');
                endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            } else {
                endDateTime.setHours(23, 59, 59, 999);
            }
        }
        
        onSave({
            title,
            description,
            startDate: startDateTime.toISOString(),
            endDate: endDateTime ? endDateTime.toISOString() : null,
            allDay,
            pinned,
            color,
            reminderMinutes
        });
    };

    // Prevent body scroll, zoom, and horizontal scroll when modal is open (especially on mobile)
    useEffect(() => {
        if (!isOpen) return;
        
        // Store original values
        const originalOverflow = document.body.style.overflow;
        const originalDocOverflow = document.documentElement.style.overflow;
        const originalPosition = document.body.style.position;
        const originalWidth = document.body.style.width;
        const originalTouchAction = document.body.style.touchAction;
        
        // Prevent scroll
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        
        // Prevent horizontal scroll and zoom on mobile
        if (isMobile) {
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.touchAction = 'pan-y';
            
            // Prevent zoom with touch gestures
            const preventZoom = (e: TouchEvent) => {
                if (e.touches.length > 1) {
                    e.preventDefault();
                }
            };
            document.addEventListener('touchstart', preventZoom, { passive: false });
            document.addEventListener('touchmove', preventZoom, { passive: false });
            
            return () => {
                document.body.style.overflow = originalOverflow;
                document.documentElement.style.overflow = originalDocOverflow;
                document.body.style.position = originalPosition;
                document.body.style.width = originalWidth;
                document.body.style.touchAction = originalTouchAction;
                document.removeEventListener('touchstart', preventZoom);
                document.removeEventListener('touchmove', preventZoom);
            };
        }
        
        return () => {
            document.body.style.overflow = originalOverflow;
            document.documentElement.style.overflow = originalDocOverflow;
            document.body.style.position = originalPosition;
            document.body.style.width = originalWidth;
            document.body.style.touchAction = originalTouchAction;
        };
    }, [isOpen, isMobile]);

    if (!mounted) return null;

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - Full screen coverage without any borders */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm"
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
                    
                    {/* Modal Card - Desktop: Centered, Mobile: Slides up from bottom */}
                    <motion.div
                        initial={{ 
                            y: isMobile ? "100%" : 20, 
                            opacity: 0,
                            scale: isMobile ? 1 : 0.95
                        }}
                        animate={{ 
                            y: 0, 
                            opacity: 1,
                            scale: 1
                        }}
                        exit={{ 
                            y: isMobile ? "100%" : 20, 
                            opacity: 0,
                            scale: isMobile ? 1 : 0.95
                        }}
                        transition={{ 
                            type: "spring", 
                            damping: 30, 
                            stiffness: 300,
                            mass: 0.8
                        }}
                        className={cn(
                            "z-[10001] bg-background border-2 border-border/60 shadow-2xl flex flex-col",
                            // Desktop: centered modal (smaller, centered)
                            "md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-full md:max-w-lg md:max-h-[85vh] md:bottom-auto",
                            // Mobile: bottom sheet (full width, slides up, no scroll)
                            "fixed bottom-0 left-0 right-0 rounded-t-[2rem] max-h-[90vh] overflow-hidden"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        style={{ 
                            paddingBottom: isMobile 
                                ? 'env(safe-area-inset-bottom, 0px)' 
                                : undefined,
                            maxHeight: isMobile
                                ? 'calc(90vh - env(safe-area-inset-bottom, 0px))'
                                : '85vh',
                            touchAction: 'pan-y', // Allow vertical scroll only
                            overscrollBehavior: 'contain', // Prevent scroll chaining
                        }}
                        onTouchMove={(e) => {
                            // Prevent horizontal scroll
                            const target = e.currentTarget;
                            const scrollContainer = target.querySelector('.overflow-y-auto');
                            if (scrollContainer) {
                                const touch = e.touches[0];
                                const scrollLeft = scrollContainer.scrollLeft;
                                if (scrollLeft > 0 || scrollLeft < 0) {
                                    e.preventDefault();
                                }
                            }
                        }}
                    >
                        {/* Drag Handle - Only on mobile */}
                        {isMobile && (
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-16 h-1 bg-border/60 rounded-full" />
                            </div>
                        )}

                        {/* Header */}
                        <div className={cn(
                            "px-6 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-background to-muted/10",
                            isMobile ? "pt-3 pb-4" : "pt-4 pb-4"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <CalIcon className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-xl md:text-2xl font-bold text-foreground">
                                    {initialData ? "Editar Evento" : "Nuevo Evento"}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPinned(!pinned)}
                                    className={cn(
                                        "p-2.5 rounded-xl transition-all",
                                        pinned 
                                            ? "bg-amber-500/10 text-amber-600 shadow-sm" 
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <Pin className={cn("w-5 h-5", pinned && "fill-current")} />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={onClose} 
                                    className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                            <div 
                                className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 md:py-6 space-y-4 md:space-y-6"
                                style={{
                                    overscrollBehavior: 'contain',
                                    WebkitOverflowScrolling: 'touch',
                                    touchAction: 'pan-y',
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: 'rgba(var(--muted-foreground), 0.2) transparent',
                                }}
                                onWheel={(e) => {
                                    // Prevent horizontal scroll
                                    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                                        e.preventDefault();
                                    }
                                }}
                            >
                                {/* Title */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Título del Evento
                                    </label>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Ej: Reunión de equipo..."
                                        className="w-full text-base md:text-lg font-semibold bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground/50"
                                        required
                                    />
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Fecha de Inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3.5 outline-none focus:border-primary focus:bg-background transition-all text-sm font-medium text-foreground"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Fecha de Fin (Opcional)
                                        </label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3.5 outline-none focus:border-primary focus:bg-background transition-all text-sm font-medium text-foreground"
                                        />
                                    </div>
                                </div>

                                {/* All Day Toggle - Improved */}
                                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-muted/30 to-muted/20 rounded-xl md:rounded-2xl border-2 border-border/40 hover:border-border/60 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                            allDay ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Clock className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-sm font-bold text-foreground block">Todo el día</span>
                                            <span className="text-xs text-muted-foreground">Sin hora específica</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAllDay(!allDay)}
                                        className={cn(
                                            "w-14 h-8 rounded-full transition-all relative shadow-inner",
                                            allDay ? "bg-primary" : "bg-muted-foreground/30"
                                        )}
                                    >
                                        <motion.div
                                            animate={{ x: allDay ? 28 : 2 }}
                                            transition={{ type: "spring", stiffness: 600, damping: 35 }}
                                            className="absolute top-1 left-0 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center"
                                        >
                                            {allDay && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="w-3 h-3 bg-primary rounded-full"
                                                />
                                            )}
                                        </motion.div>
                                    </button>
                                </div>

                                {/* Time Fields - Only show if not all day */}
                                {!allDay && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                    >
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5" />
                                                Hora de Inicio
                                            </label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                className="w-full bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3.5 outline-none focus:border-primary focus:bg-background transition-all text-sm font-medium text-foreground"
                                                required={!allDay}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5" />
                                                Hora de Fin (Opcional)
                                            </label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3.5 outline-none focus:border-primary focus:bg-background transition-all text-sm font-medium text-foreground"
                                            />
                                        </div>
                                    </motion.div>
                                )}

                                {/* Reminder - Enhanced */}
                                <div className="space-y-3 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl md:rounded-2xl border-2 border-primary/20">
                                    <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                                        <Bell className="w-4 h-4 text-primary" />
                                        Recordatorio
                                    </label>
                                    <select
                                        value={reminderMinutes === null ? "none" : reminderMinutes.toString()}
                                        onChange={(e) => setReminderMinutes(e.target.value === "none" ? null : parseInt(e.target.value))}
                                        className="w-full bg-background border-2 border-primary/30 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm font-bold text-foreground"
                                    >
                                        <option value="none">Sin recordatorio</option>
                                        <option value="5">5 minutos antes</option>
                                        <option value="15">15 minutos antes</option>
                                        <option value="30">30 minutos antes</option>
                                        <option value="60">1 hora antes</option>
                                        <option value="120">2 horas antes</option>
                                        <option value="1440">1 día antes</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                                        <Bell className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                        <span>Recibirás una notificación en tu dispositivo cuando llegue el momento del recordatorio. Funciona en PWA y escritorio.</span>
                                    </p>
                                </div>

                                {/* Color Selection */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Color de Etiqueta
                                    </label>
                                    <div className="flex gap-2 md:gap-3 flex-wrap">
                                        {COLORS.map(c => (
                                            <motion.button
                                                key={c.name}
                                                type="button"
                                                onClick={() => setColor(c.name)}
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.95 }}
                                                className={cn(
                                                    "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl transition-all border-4 shadow-sm",
                                                    c.name === color 
                                                        ? "scale-110 border-foreground shadow-lg ring-2 ring-primary/30" 
                                                        : "border-transparent opacity-60 hover:opacity-100",
                                                    c.value.split(' ')[0]
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Descripción (Opcional)
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Añade detalles sobre el evento..."
                                        rows={3}
                                        className="w-full text-sm bg-muted/50 border-2 border-border/60 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all resize-none text-foreground placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="px-6 py-4 md:py-5 border-t-2 border-border/40 bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                {initialData && onDelete && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => onDelete(initialData.id)}
                                        className="bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-600 rounded-xl md:rounded-2xl font-bold h-10 md:h-12 text-sm md:text-base order-2 sm:order-1 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" />
                                        Eliminar
                                    </Button>
                                )}
                                <Button 
                                    type="submit" 
                                    className="flex-1 rounded-xl md:rounded-2xl h-10 md:h-12 font-bold text-sm md:text-base shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all order-1 sm:order-2"
                                >
                                    <Save className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" />
                                    {initialData ? "Guardar Cambios" : "Crear Evento"}
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
