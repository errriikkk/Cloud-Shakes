import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

const createEventSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string(), // ISO date string
    endDate: z.string().nullable().optional(),
    allDay: z.boolean().optional(),
    pinned: z.boolean().optional(),
    color: z.string().optional(),
    reminderMinutes: z.number().nullable().optional(), // Minutes before event (null = no reminder)
});

const updateEventSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    startDate: z.string().optional(),
    endDate: z.string().nullable().optional(),
    allDay: z.boolean().optional(),
    pinned: z.boolean().optional(),
    color: z.string().optional(),
    reminderMinutes: z.number().nullable().optional(),
    reminderSent: z.boolean().optional(),
});

// @route   GET /api/calendar
// @desc    List calendar events for a month/year range
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        // Validate user
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }

        // Validate and parse month/year parameters
        const monthParam = req.query.month as string;
        const yearParam = req.query.year as string;
        
        let month: number;
        let year: number;

        if (monthParam) {
            month = parseInt(monthParam, 10);
            if (isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({ message: 'Mes inválido. Debe ser un número entre 1 y 12' });
            }
        } else {
            month = new Date().getMonth() + 1;
        }

        if (yearParam) {
            year = parseInt(yearParam, 10);
            if (isNaN(year) || year < 1900 || year > 2100) {
                return res.status(400).json({ message: 'Año inválido. Debe ser un número entre 1900 y 2100' });
            }
        } else {
            year = new Date().getFullYear();
        }

        // Get events for the given month (with some overflow for calendar display)
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);

        // Validate dates
        if (isNaN(startOfMonth.getTime()) || isNaN(endOfMonth.getTime())) {
            return res.status(400).json({ message: 'Fechas inválidas generadas' });
        }

        // Extend range by 1 week on each side for calendar grid display
        const rangeStart = new Date(startOfMonth);
        rangeStart.setDate(rangeStart.getDate() - 7);
        const rangeEnd = new Date(endOfMonth);
        rangeEnd.setDate(rangeEnd.getDate() + 7);

        const events = await prisma.calendarEvent.findMany({
            where: {
                // Shared within instance: all events in range
                startDate: {
                    gte: rangeStart,
                    lte: rangeEnd,
                },
            },
            orderBy: { startDate: 'asc' },
        });

        res.json(events);
    } catch (err: any) {
        console.error('Error en GET /api/calendar:', err);
        console.error('Stack:', err?.stack);
        next(err);
    }
});

// @route   POST /api/calendar
// @desc    Create a calendar event
// @access  Private
router.post('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const { title, description, startDate, endDate, allDay, pinned, color, reminderMinutes } = createEventSchema.parse(req.body);

        const event = await prisma.calendarEvent.create({
            data: {
                title,
                description: description || null,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                allDay: allDay || false,
                pinned: pinned || false,
                color: color || 'primary',
                reminderMinutes: reminderMinutes !== undefined ? reminderMinutes : null,
                reminderSent: false,
                ownerId: req.user.id,
            },
        });

        res.json(event);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   PUT /api/calendar/:id
// @desc    Update a calendar event
// @access  Private
router.put('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const data = updateEventSchema.parse(req.body);

        const existing = await prisma.calendarEvent.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Evento no encontrado' });
        }

        if (existing.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const updateData: any = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.startDate !== undefined) {
            updateData.startDate = new Date(data.startDate);
            // Reset reminderSent when startDate changes
            updateData.reminderSent = false;
        }
        if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
        if (data.allDay !== undefined) updateData.allDay = data.allDay;
        if (data.pinned !== undefined) updateData.pinned = data.pinned;
        if (data.color !== undefined) updateData.color = data.color;
        if (data.reminderMinutes !== undefined) {
            updateData.reminderMinutes = data.reminderMinutes;
            // Reset reminderSent when reminderMinutes changes
            updateData.reminderSent = false;
        }
        if (data.reminderSent !== undefined) updateData.reminderSent = data.reminderSent;

        const updated = await prisma.calendarEvent.update({
            where: { id: req.params.id as string },
            data: updateData,
        });

        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   DELETE /api/calendar/:id
// @desc    Delete a calendar event
// @access  Private
router.delete('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const event = await prisma.calendarEvent.findUnique({
            where: { id: req.params.id as string },
        });

        if (!event) {
            return res.status(404).json({ message: 'Evento no encontrado' });
        }

        if (event.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        await prisma.calendarEvent.delete({
            where: { id: req.params.id as string },
        });

        res.json({ message: 'Evento eliminado' });
    } catch (err) {
        next(err);
    }
});

export default router;
