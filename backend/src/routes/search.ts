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
                    },
                    owner: {
                        select: { id: true, username: true, displayName: true, avatar: true }
                    },
                },
                take: 10,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.folder.findMany({
                where: {
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
                    },
                    owner: {
                        select: { id: true, username: true, displayName: true, avatar: true }
                    },
                },
                take: 10,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.document.findMany({
                where: {
                    title: {
                        contains: query,
                        mode: 'insensitive',
                    },
                },
                include: {
                    owner: {
                        select: { id: true, username: true, displayName: true, avatar: true }
                    },
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.note.findMany({
                where: {
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { content: { contains: query, mode: 'insensitive' } },
                    ],
                },
                include: {
                    owner: {
                        select: { id: true, username: true, displayName: true, avatar: true }
                    },
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.calendarEvent.findMany({
                where: {
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                    ],
                },
                include: {
                    owner: {
                        select: { id: true, username: true, displayName: true, avatar: true }
                    },
                },
                take: 10,
                orderBy: { startDate: 'asc' },
            }),
        ]);

        const apiBase =
            process.env.API_URL ||
            (process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin.replace('cloud.', 'api.') : null) ||
            'http://localhost:5000';

        const withOwnerAvatarUrl = (item: any) => {
            if (!item?.owner) return item;
            const avatar = item.owner.avatar;
            const avatarUrl =
                typeof avatar === 'string' && avatar.startsWith('avatars/')
                    ? `${apiBase}/api/profile/avatar/${item.owner.id}`
                    : null;
            return {
                ...item,
                owner: {
                    ...item.owner,
                    avatarUrl,
                },
            };
        };

        res.json({
            files: files.map(f => ({
                ...withOwnerAvatarUrl(f),
                size: f.size.toString(),
                type: 'file',
            })),
            folders: folders.map(f => ({
                ...withOwnerAvatarUrl(f),
                type: 'folder',
            })),
            documents: documents.map(d => ({
                ...withOwnerAvatarUrl(d),
                type: 'document',
            })),
            notes: notes.map(n => ({
                ...withOwnerAvatarUrl(n),
                type: 'note',
            })),
            calendarEvents: calendarEvents.map(e => ({
                ...withOwnerAvatarUrl(e),
                type: 'calendar',
            })),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
