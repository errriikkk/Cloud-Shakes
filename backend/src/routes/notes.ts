import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';

const router = express.Router();

const createNoteSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    scope: z.enum(['private', 'workspace']).optional(),
    color: z.string().optional(),
});

const updateNoteSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    scope: z.enum(['private', 'workspace']).optional(),
    color: z.string().optional(),
    pinned: z.boolean().optional(),
});

// @route   GET /api/notes
// @desc    List all notes for the current user
// @access  Private - requires view_notes permission
router.get('/', protect, requirePermission('view_notes'), async (req: AuthRequest, res, next) => {
    try {
        const { page = '1', limit = '50', scope = 'all', pinned, q, authorId } = req.query;
        const pageNum = Math.min(Math.max(parseInt(page as string) || 1, 1), 100);
        const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        const scopeStr = String(scope);
        const pinnedStr = pinned !== undefined ? String(pinned) : null;
        const qStr = q ? String(q).trim() : "";
        const authorStr = authorId ? String(authorId) : null;

        const where: any = {
            AND: [],
        };

        // Visibility: by default show my private + workspace notes.
        // Optional filters:
        // - scope=private => only my private notes
        // - scope=workspace => only workspace notes
        // - scope=all => my private + workspace notes
        if (scopeStr === 'private') {
            where.AND.push({ scope: 'private' }, { ownerId: req.user.id });
        } else if (scopeStr === 'workspace') {
            where.AND.push({ scope: 'workspace' });
        } else {
            where.AND.push({
                OR: [
                    { scope: 'workspace' },
                    { scope: 'private', ownerId: req.user.id },
                ],
            });
        }

        if (pinnedStr === 'true') where.AND.push({ pinned: true });
        if (pinnedStr === 'false') where.AND.push({ pinned: false });

        if (authorStr) {
            // Author filter is always by ownerId (creator)
            where.AND.push({ ownerId: authorStr });
        }

        if (qStr.length >= 2) {
            where.AND.push({
                OR: [
                    { title: { contains: qStr, mode: 'insensitive' } },
                    { content: { contains: qStr, mode: 'insensitive' } },
                ],
            });
        }

        const [notes, total] = await Promise.all([
            prisma.note.findMany({
                where,
                orderBy: [
                    { pinned: 'desc' },
                    { updatedAt: 'desc' },
                ],
                skip,
                take: limitNum,
                include: {
                    owner: { select: { id: true, username: true, displayName: true } },
                    lastModifiedBy: { select: { id: true, username: true, displayName: true } },
                },
            }),
            prisma.note.count({ where }),
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
        const { title, content, color, scope } = createNoteSchema.parse(req.body);

        const note = await prisma.note.create({
            data: {
                title: title || '',
                content: content || '',
                scope: scope || 'private',
                color: color || 'default',
                ownerId: req.user.id,
                lastModifiedById: req.user.id,
            },
            include: {
                owner: { select: { id: true, username: true, displayName: true } },
                lastModifiedBy: { select: { id: true, username: true, displayName: true } },
            }
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
        const { title, content, color, pinned, scope } = updateNoteSchema.parse(req.body);

        const existing = await prisma.note.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Nota no encontrada' });
        }

        // Authorization:
        // - Workspace notes: any user with edit_notes can edit (already enforced), plus active user
        // - Private notes: only owner or admin can edit
        if (!req.user.isAdmin) {
            if (existing.scope === 'private' && existing.ownerId !== req.user.id) {
                return res.status(403).json({ message: 'No autorizado' });
            }
        }

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (scope !== undefined) updateData.scope = scope;
        if (color !== undefined) updateData.color = color;
        if (pinned !== undefined) updateData.pinned = pinned;
        updateData.lastModifiedById = req.user.id;

        const updated = await prisma.note.update({
            where: { id: req.params.id as string },
            data: updateData,
            include: {
                owner: { select: { id: true, username: true, displayName: true } },
                lastModifiedBy: { select: { id: true, username: true, displayName: true } },
            }
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

        // Authorization:
        // - Workspace notes: any user with delete_notes can delete (already enforced)
        // - Private notes: only owner or admin can delete
        if (!req.user.isAdmin) {
            if (note.scope === 'private' && note.ownerId !== req.user.id) {
                return res.status(403).json({ message: 'No autorizado' });
            }
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
