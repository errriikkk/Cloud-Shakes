import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

const createNoteSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    color: z.string().optional(),
});

const updateNoteSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    color: z.string().optional(),
    pinned: z.boolean().optional(),
});

// @route   GET /api/notes
// @desc    List all notes for the current user (pinned first, then by updatedAt)
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const notes = await prisma.note.findMany({
            where: { ownerId: req.user.id },
            orderBy: [
                { pinned: 'desc' },
                { updatedAt: 'desc' },
            ],
        });
        res.json(notes);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private
router.post('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const { title, content, color } = createNoteSchema.parse(req.body);

        const note = await prisma.note.create({
            data: {
                title: title || '',
                content: content || '',
                color: color || 'default',
                ownerId: req.user.id,
            },
        });

        res.json(note);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   PUT /api/notes/:id
// @desc    Update a note
// @access  Private
router.put('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const { title, content, color, pinned } = updateNoteSchema.parse(req.body);

        const existing = await prisma.note.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Nota no encontrada' });
        }

        if (existing.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (color !== undefined) updateData.color = color;
        if (pinned !== undefined) updateData.pinned = pinned;

        const updated = await prisma.note.update({
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

// @route   DELETE /api/notes/:id
// @desc    Delete a note
// @access  Private
router.delete('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const note = await prisma.note.findUnique({
            where: { id: req.params.id as string },
        });

        if (!note) {
            return res.status(404).json({ message: 'Nota no encontrada' });
        }

        if (note.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        await prisma.note.delete({
            where: { id: req.params.id as string },
        });

        res.json({ message: 'Nota eliminada' });
    } catch (err) {
        next(err);
    }
});

export default router;
