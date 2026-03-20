import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';

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
// @desc    List all notes for the current user
// @access  Private - requires view_notes permission
router.get('/', protect, requirePermission('view_notes'), async (req: AuthRequest, res, next) => {
    try {
        const { page = '1', limit = '50' } = req.query;
        const pageNum = Math.min(Math.max(parseInt(page as string) || 1, 1), 100);
        const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        const [notes, total] = await Promise.all([
            prisma.note.findMany({
                orderBy: [
                    { pinned: 'desc' },
                    { updatedAt: 'desc' },
                ],
                skip,
                take: limitNum,
                include: {
                    owner: { select: { id: true, username: true, displayName: true } },
                },
            }),
            prisma.note.count(),
        ]);
        res.json({
            data: notes,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private
router.post('/', protect, requirePermission('create_notes'), async (req: AuthRequest, res, next) => {
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

        // Log activity
        await createActivity(
            req.user.id,
            'note',
            'create',
            note.id,
            'note',
            note.title || 'Untitled Note'
        );

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
router.put('/:id', protect, requirePermission('edit_notes'), async (req: AuthRequest, res, next) => {
    try {
        const { title, content, color, pinned } = updateNoteSchema.parse(req.body);

        const existing = await prisma.note.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Nota no encontrada' });
        }

        if (existing.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_notes')) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (color !== undefined) updateData.color = color;
        if (pinned !== undefined) updateData.pinned = pinned;
        updateData.lastModifiedById = req.user.id;

        const updated = await prisma.note.update({
            where: { id: req.params.id as string },
            data: updateData,
        });

        // Log activity
        await createActivity(
            req.user.id,
            'note',
            'edit',
            updated.id,
            'note',
            updated.title || 'Untitled Note'
        );

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
router.delete('/:id', protect, requirePermission('delete_notes'), async (req: AuthRequest, res, next) => {
    try {
        const note = await prisma.note.findUnique({
            where: { id: req.params.id as string },
        });

        if (!note) {
            return res.status(404).json({ message: 'Nota no encontrada' });
        }

        if (note.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_notes')) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        await prisma.note.delete({
            where: { id: req.params.id as string },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'note',
            'delete',
            req.params.id as string,
            'note',
            note.title || 'Untitled Note'
        );

        res.json({ message: 'Nota eliminada' });
    } catch (err) {
        next(err);
    }
});

export default router;
