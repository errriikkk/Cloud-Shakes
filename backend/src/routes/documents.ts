import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';

const router = express.Router();

const createDocumentSchema = z.object({
    title: z.string().optional(),
    content: z.any().optional(),
    folderId: z.string().uuid().nullable().optional(),
});

const updateDocumentSchema = z.object({
    title: z.string().optional(),
    content: z.any().optional(),
    folderId: z.string().uuid().nullable().optional(),
});

// @route   GET /api/documents
// @desc    List all documents for the current user
// @access  Private - requires view_documents permission
router.get('/', protect, requirePermission('view_documents'), async (req: AuthRequest, res, next) => {
    try {
        const { page = '1', limit = '50' } = req.query;
        const pageNum = Math.min(Math.max(parseInt(page as string) || 1, 1), 100);
        const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        const [documents, total] = await Promise.all([
            prisma.document.findMany({
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limitNum,
                select: {
                    id: true,
                    title: true,
                    folderId: true,
                    createdAt: true,
                    updatedAt: true,
                    owner: { select: { id: true, username: true, displayName: true } },
                },
            }),
            prisma.document.count(),
        ]);
        res.json({
            data: documents,
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

// @route   POST /api/documents
// @desc    Create a new document
// @access  Private
router.post('/', protect, requirePermission('create_documents'), async (req: AuthRequest, res, next) => {
    try {
        const { title, content, folderId } = createDocumentSchema.parse(req.body);

        const doc = await prisma.document.create({
            data: {
                title: title || 'Sin título',
                content: content || { type: 'doc', content: [] },
                ownerId: req.user.id,
                folderId: folderId || null,
            },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'document',
            'create',
            doc.id,
            'document',
            doc.title
        );

        res.json(doc);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   GET /api/documents/:id
// @desc    Get a single document (with full content)
// @access  Private
router.get('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: req.params.id as string },
        });

        if (!doc) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        res.json(doc);
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/documents/:id
// @desc    Update a document (auto-save support)
// @access  Private
router.put('/:id', protect, requirePermission('edit_documents'), async (req: AuthRequest, res, next) => {
    try {
        const { title, content, folderId } = updateDocumentSchema.parse(req.body);

        const existing = await prisma.document.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        if (existing.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_documents')) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (folderId !== undefined) updateData.folderId = folderId;
        updateData.lastModifiedById = req.user.id;

        const updated = await prisma.document.update({
            where: { id: req.params.id as string },
            data: updateData,
        });

        // Log activity
        await createActivity(
            req.user.id,
            'document',
            'edit',
            updated.id,
            'document',
            updated.title
        );

        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   DELETE /api/documents/:id
// @desc    Delete a document
// @access  Private
router.delete('/:id', protect, requirePermission('delete_documents'), async (req: AuthRequest, res, next) => {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: req.params.id as string },
        });

        if (!doc) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        if (doc.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_documents')) {
            return res.status(403).json({ message: 'No autorizado' });
        }

        await prisma.document.delete({
            where: { id: req.params.id as string },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'document',
            'delete',
            req.params.id as string,
            'document',
            doc.title
        );

        res.json({ message: 'Documento eliminado' });
    } catch (err) {
        next(err);
    }
});

export default router;
