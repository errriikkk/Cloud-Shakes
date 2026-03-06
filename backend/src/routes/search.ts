import express from 'express';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// @route   GET /api/search
// @desc    Global search files and folders
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const query = req.query.q as string;

        if (!query) {
            return res.json({ files: [], folders: [] });
        }

        const [files, folders, documents, notes, calendarEvents] = await Promise.all([
            prisma.file.findMany({
                where: {
                    ownerId: req.user.id,
                    originalName: {
                        contains: query,
                        mode: 'insensitive',
                    },
                },
                include: {
                    folder: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                },
                take: 10,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.folder.findMany({
                where: {
                    ownerId: req.user.id,
                    name: {
                        contains: query,
                        mode: 'insensitive',
                    },
                },
                include: {
                    parent: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                },
                take: 10,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.document.findMany({
                where: {
                    ownerId: req.user.id,
                    title: {
                        contains: query,
                        mode: 'insensitive',
                    },
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.note.findMany({
                where: {
                    ownerId: req.user.id,
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { content: { contains: query, mode: 'insensitive' } },
                    ],
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.calendarEvent.findMany({
                where: {
                    ownerId: req.user.id,
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                    ],
                },
                take: 10,
                orderBy: { startDate: 'asc' },
            }),
        ]);

        res.json({
            files: files.map(f => ({
                ...f,
                size: f.size.toString(),
                type: 'file',
            })),
            folders: folders.map(f => ({
                ...f,
                type: 'folder',
            })),
            documents: documents.map(d => ({
                ...d,
                type: 'document',
            })),
            notes: notes.map(n => ({
                ...n,
                type: 'note',
            })),
            calendarEvents: calendarEvents.map(e => ({
                ...e,
                type: 'calendar',
            })),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
