import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const prismaAny = prisma as any;

const shareSchema = z.object({
    userId: z.string().optional(),
    roleId: z.string().optional(),
    permission: z.enum(['READ', 'EDIT', 'FULL']).default('READ'),
});

// GET /api/files/:id/shares - Get all shares for a file
router.get('/:id/shares', protect, async (req: AuthRequest, res, next) => {
    try {
        const fileId = req.params.id as string;

        const file = await prisma.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Only owner or admin can see shares
        const userRoles = await prismaAny.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: { include: { permission: true } } } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.key))
        );
        const canManage = req.user.isAdmin || permissions.has('share_files');

        if (file.ownerId !== req.user.id && !canManage) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const shares = await prismaAny.fileShare.findMany({
            where: { fileId },
            include: {
                user: { select: { id: true, username: true, displayName: true, avatar: true } },
                role: { select: { id: true, name: true, color: true } },
            },
        });

        res.json(shares);
    } catch (err) {
        next(err);
    }
});

// POST /api/files/:id/shares - Share a file with user or role
router.post('/:id/shares', protect, async (req: AuthRequest, res, next) => {
    try {
        const fileId = req.params.id as string;
        const data = shareSchema.parse(req.body);

        const file = await prisma.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Only owner or admin can share
        const userRoles = await prismaAny.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: { include: { permission: true } } } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.key))
        );
        const canShare = req.user.isAdmin || permissions.has('share_files');

        if (file.ownerId !== req.user.id && !canShare) {
            return res.status(403).json({ message: 'Not authorized to share this file' });
        }

        // Validate that either userId or roleId is provided
        if (!data.userId && !data.roleId) {
            return res.status(400).json({ message: 'Either userId or roleId must be provided' });
        }

        const share = await prismaAny.fileShare.upsert({
            where: {
                fileId_userId: { fileId, userId: data.userId || '' },
            },
            update: {
                permission: data.permission,
            },
            create: {
                fileId,
                userId: data.userId || null,
                roleId: data.roleId || null,
                permission: data.permission,
                createdBy: req.user.id,
            },
            include: {
                user: { select: { id: true, username: true, displayName: true, avatar: true } },
                role: { select: { id: true, name: true, color: true } },
            },
        });

        res.status(201).json(share);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: err.errors });
        }
        next(err);
    }
});

// DELETE /api/files/:id/shares/:shareId - Remove a share
router.delete('/:id/shares/:shareId', protect, async (req: AuthRequest, res, next) => {
    try {
        const { id, shareId } = req.params;

        const file = await prisma.file.findUnique({
            where: { id: id as string },
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Only owner or admin can remove shares
        const userRoles = await prismaAny.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: { include: { permission: true } } } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.key))
        );
        const canShare = req.user.isAdmin || permissions.has('share_files');

        if (file.ownerId !== req.user.id && !canShare) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await prismaAny.fileShare.delete({
            where: { id: shareId as string },
        });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
