"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Pin, List, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { EventModal } from "@/components/EventModal";
import { useModal } from "@/hooks/useModal";
import { useNotifications } from "@/hooks/useNotifications";
import { motion, AnimatePresence } from "framer-motion";
import { ActivityAvatar } from "@/components/ActivityAvatar";

interface CalendarEvent {
    id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string | null;
    allDay: boolean;
    pinned: boolean;
    color: string;
    reminderMinutes?: number | null;
    owner?: { id: string; username: string; displayName: string };
    lastModifiedBy?: { id: string; username: string; displayName: string } | null;
}

const COLOR_MAP: Record<string, string> = {
    primary: "bg-primary/20 text-primary border-primary/20",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
    yellow: "bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-rose-100 text-rose-700 border-rose-200",
    purple: "bg-violet-100 text-violet-700 border-violet-200",
};

export default function CalendarPage() {
    const { user } = useAuth();
    const { confirm, alert, ModalComponents } = useModal();
    const { isSupported, permission, requestPermission, isIOSDevice, isPWA } = useNotifications();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'calendar' | 'events'>('calendar');

    // Fetch events for current month view
    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_ENDPOINTS.CALENDAR.BASE, {
                params: {
                    month: currentDate.getMonth() + 1,
                    year: currentDate.getFullYear()
                },
                withCredentials: true
            });
            setEvents(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [currentDate]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // Calendar Grid Logic
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDateGrid = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDateGrid = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: startDateGrid, end: endDateGrid });

    const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

    const handleOpenCreate = (day: Date) => {
        setSelectedDate(day);
        setActiveEvent(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, event: CalendarEvent) => {
        e.stopPropagation();
        setActiveEvent(event);
        setIsModalOpen(true);
    };

    const handleSaveEvent = async (data: any) => {
        try {
            if (activeEvent) {
                const res = await axios.put(API_ENDPOINTS.CALENDAR.DETAIL(activeEvent.id), data, { withCredentials: true });
                setEvents(prev => prev.map(e => e.id === activeEvent.id ? res.data : e));
            } else {
                const res = await axios.post(API_ENDPOINTS.CALENDAR.BASE, data, { withCredentials: true });
                setEvents(prev => [...prev, res.data]);
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error("Save event failed:", err);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        const confirmed = await confirm(
            "Eliminar Evento",
            "¿Estás seguro de que quieres eliminar este evento? Esta acción no se puede deshacer.",
            { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
        );
        if (!confirmed) return;
        try {
            await axios.delete(API_ENDPOINTS.CALENDAR.DETAIL(id), { withCredentials: true });
            setEvents(prev => prev.filter(e => e.id !== id));
            setIsModalOpen(false);
        } catch (err) {
            console.error("Delete failed:", err);
            await alert("Error", "No se pudo eliminar el evento. Por favor, intenta de nuevo.", { type: 'danger' });
        }
    };

    // Sort events for list view
    const sortedEvents = [...events].sort((a, b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const [showNotificationBanner, setShowNotificationBanner] = useState(false);

    useEffect(() => {
        if (isSupported && permission === "default") {
            setShowNotificationBanner(true);
        }
    }, [isSupported, permission]);

    return (
        <div className="space-y-6 pb-20 md:pb-0">
            {/* Notification Permission Banner */}
            {showNotificationBanner && isSupported && permission === "default" && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground">Activa las notificaciones</p>
                            <p className="text-xs text-muted-foreground">
                                {isIOSDevice && !isPWA 
                                    ? "Recibe recordatorios. Para notificaciones en background, instala la app (menú → Agregar a pantalla de inicio)"
                                    : "Recibe recordatorios de tus eventos del calendario"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={async () => {
                                const granted = await requestPermission();
                                if (granted) {
                                    setShowNotificationBanner(false);
                                    const message = isIOSDevice && !isPWA
                                        ? "Notificaciones activadas. Para recibir notificaciones cuando la app esté cerrada, instálala desde el menú de Safari (compartir → Agregar a pantalla de inicio)."
                                        : "Las notificaciones están activadas. Recibirás recordatorios de tus eventos.";
                                    await alert("Éxito", message, { type: 'success' });
                                } else {
                                    await alert("Permisos denegados", "Las notificaciones están desactivadas. Puedes activarlas desde la configuración del navegador.", { type: 'warning' });
                                }
                            }}
                            className="rounded-xl h-9"
                        >
                            Activar
                        </Button>
                        <button
                            onClick={() => setShowNotificationBanner(false)}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Header with Tabs */}
            <div className="flex flex-col gap-4">
                {/* Title and Tabs in same line on desktop, stacked on mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight capitalize text-foreground">
                        {format(currentDate, "MMMM yyyy", { locale: es })}
                    </h1>
                    {/* Tabs - Enhanced with animations, aligned with title */}
                    <div className="relative flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50 shadow-sm self-start sm:self-center">
                        {/* Animated background indicator */}
                        <motion.div
                            className="absolute top-1 bottom-1 rounded-lg bg-primary/20 border border-primary/40 shadow-sm"
                            initial={false}
                            animate={{
                                left: activeTab === 'calendar' ? '4px' : '50%',
                                width: activeTab === 'calendar' ? 'calc(50% - 4px)' : 'calc(50% - 4px)',
                            }}
                            transition={{
                                type: "spring",
                                stiffness: 600,
                                damping: 40,
                            }}
                        />
                        <button
                            onClick={() => setActiveTab('calendar')}
                            className={cn(
                                "relative z-10 flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-w-[90px] sm:min-w-[110px]",
                                activeTab === 'calendar' 
                                    ? "text-primary" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <CalIcon className={cn(
                                "w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform shrink-0",
                                activeTab === 'calendar' && "scale-110"
                            )} />
                            <span className="hidden sm:inline">Calendario</span>
                            <span className="sm:hidden">Cal</span>
                        </button>
                        <div className="w-px h-5 sm:h-6 bg-border/50" />
                        <button
                            onClick={() => setActiveTab('events')}
                            className={cn(
                                "relative z-10 flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-w-[90px] sm:min-w-[110px]",
                                activeTab === 'events' 
                                    ? "text-primary" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <List className={cn(
                                "w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform shrink-0",
                                activeTab === 'events' && "scale-110"
                            )} />
                            <span className="hidden sm:inline">Eventos</span>
                            <span className="sm:hidden">Lista</span>
                            {events.length > 0 && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={cn(
                                        "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                        activeTab === 'events'
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted-foreground/20 text-muted-foreground"
                                    )}
                                >
                                    {events.length}
                                </motion.span>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeTab === 'calendar' && (
                        <>
                            <button onClick={handlePrevMonth} className="p-2 hover:bg-muted rounded-xl transition-colors">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button onClick={() => setCurrentDate(new Date())} className="text-sm font-bold bg-muted/50 px-4 py-2 hover:bg-muted rounded-xl transition-all active:scale-95">
                                Hoy
                            </button>
                            <button onClick={handleNextMonth} className="p-2 hover:bg-muted rounded-xl transition-colors">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </>
                    )}
                    <Button onClick={() => handleOpenCreate(new Date())} className="rounded-xl h-10 shadow-lg shadow-primary/10">
                        <Plus className="w-4 h-4 mr-2" />
                        Evento
                    </Button>
                </div>
            </div>

            {/* Calendar View */}
            <AnimatePresence mode="wait">
                {activeTab === 'calendar' && (
                    <motion.div
                        key="calendar"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="h-[calc(100vh-12rem)] flex flex-col"
                    >
                        <div className="flex-1 bg-background border border-border/40 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col">
                        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/10">
                            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                                <div key={d} className="py-3 text-center text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em]">
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className="flex-1 grid grid-cols-7 grid-rows-6">
                    {calendarDays.map((day, idx) => {
                        // Improved matching for multi-day events
                        const dayEvents = events.filter(e => {
                            const start = startOfDay(parseISO(e.startDate));
                            const end = e.endDate ? endOfDay(parseISO(e.endDate)) : endOfDay(start);
                            return isWithinInterval(day, { start, end });
                        });

                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isCurrentMonth = isSameMonth(day, currentDate);

                        return (
                            <div
                                key={day.toISOString()}
                                onClick={() => handleOpenCreate(day)}
                                className={cn(
                                    "border-r border-b border-border/40 p-1.5 relative flex flex-col gap-1 transition-all min-h-[90px]",
                                    !isCurrentMonth && "bg-muted/5 opacity-40",
                                    "hover:bg-muted/20 cursor-pointer group"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={cn(
                                        "text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                                        isToday(day) ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground/50"
                                    )}>
                                        {format(day, "d")}
                                    </span>
                                </div>
                                <div className="flex-1 flex flex-col gap-1 overflow-y-auto no-scrollbar">
                                    {dayEvents.slice(0, 4).map(event => (
                                        <div
                                            key={event.id}
                                            onClick={(e) => handleOpenEdit(e, event)}
                                            className={cn(
                                                "text-[9px] font-bold px-2 py-1 rounded-lg border-l-4 truncate transition-all active:scale-95 hover:brightness-95 flex items-center gap-1",
                                                COLOR_MAP[event.color] || COLOR_MAP.primary,
                                                event.pinned && "shadow-sm ring-1 ring-black/5"
                                            )}
                                        >
                                            {event.pinned && <Pin className="w-2.5 h-2.5 shrink-0" />}
                                            <span className="truncate">{event.title}</span>
                                        </div>
                                    ))}
                                    {dayEvents.length > 4 && (
                                        <span className="text-[8px] font-bold text-muted-foreground/40 pl-1">
                                            +{dayEvents.length - 4} más
                                        </span>
                                    )}
                                </div>
                                {/* Visual indicator for selected date */}
                                {isSelected && (
                                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20 animate-in slide-in-from-bottom duration-300" />
                                )}
                            </div>
                        );
                    })}
                        </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Events List View */}
            <AnimatePresence mode="wait">
                {activeTab === 'events' && (
                    <motion.div
                        key="events"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="space-y-4"
                    >
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : sortedEvents.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">
                            <CalIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No tienes eventos aún.</p>
                            <Button onClick={() => handleOpenCreate(new Date())} variant="link" className="mt-4">
                                Crear el primero
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedEvents.map((event) => (
                                <div
                                    key={event.id}
                                    onClick={(e) => handleOpenEdit(e, event)}
                                    className={cn(
                                        "p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer group",
                                        COLOR_MAP[event.color] || COLOR_MAP.primary
                                    )}
                                >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-bold text-foreground flex-1 group-hover:text-primary transition-colors">
                                                {event.title}
                                            </h3>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <ActivityAvatar
                                                    user={event.lastModifiedBy || event.owner}
                                                    resourceId={event.id}
                                                    resourceType="calendar"
                                                />
                                                {event.pinned && (
                                                    <Pin className="w-4 h-4 text-primary" />
                                                )}
                                            </div>
                                        </div>
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                        <p className="flex items-center gap-1">
                                            <CalIcon className="w-3 h-3" />
                                            {format(parseISO(event.startDate), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                        </p>
                                        {event.endDate && (
                                            <p className="flex items-center gap-1">
                                                <ChevronRight className="w-3 h-3" />
                                                {format(parseISO(event.endDate), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                            </p>
                                        )}
                                        {event.allDay && (
                                            <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                                                Todo el día
                                            </span>
                                        )}
                                    </div>
                                    {event.description && (
                                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                            {String(event.description)}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    </motion.div>
                )}
            </AnimatePresence>

            <ModalComponents />
            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                initialData={activeEvent}
                selectedDate={selectedDate}
            />
        </div>
    );
}
