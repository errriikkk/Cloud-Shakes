import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/db';
import { protect, AuthRequest, requirePermission } from '../middleware/authMiddleware';
import { hashPassword } from '../utils/auth';

const router = express.Router();

const createInvitationSchema = z.object({
    email: z.string().email(),
    roleIds: z.array(z.string()).min(1),
    expiresInHours: z.number().int().min(1).max(720).optional(), // default 72h
});

const acceptInvitationSchema = z.object({
    token: z.string().min(16),
    username: z.string().min(3),
    password: z.string().min(6),
    displayName: z.string().min(1).max(100),
});

// GET /api/team/invitations - list active invitations
router.get('/', protect, requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
    try {
        const now = new Date();
        const invites = await (prisma as any).invite.findMany({
            where: {
                expiresAt: { gt: now },
                acceptedAt: null,
                revokedAt: null,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(
            invites.map((inv: any) => ({
                id: inv.id,
                email: inv.email,
                roles: inv.roles,
                expiresAt: inv.expiresAt,
                createdAt: inv.createdAt,
            })),
        );
    } catch (err) {
        next(err);
    }
});

// POST /api/team/invitations - create invitation
router.post('/', protect, requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
    try {
        const data = createInvitationSchema.parse(req.body);

        const roles = await (prisma as any).role.findMany({
            where: { id: { in: data.roleIds } },
        });

        if (!roles.length) {
            return res.status(400).json({ message: 'No valid roles provided' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (data.expiresInHours ?? 72) * 60 * 60 * 1000);

        const invite = await (prisma as any).invite.create({
            data: {
                email: data.email,
                roles: data.roleIds,
                token,
                expiresAt,
                createdById: req.user!.id,
            },
        });

        const inviteUrl = `${process.env.FRONTEND_URL || ''}/invite/${token}`;

        res.status(201).json({
            id: invite.id,
            email: invite.email,
            roles: invite.roles,
            expiresAt: invite.expiresAt,
            inviteUrl,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: (err as any).errors });
        }
        next(err);
    }
});

// DELETE /api/team/invitations/:id - revoke invitation
router.delete('/:id', protect, requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;
        const invite = await (prisma as any).invite.findUnique({ where: { id } });
        if (!invite) {
            return res.status(404).json({ message: 'Invitation not found' });
        }

        await (prisma as any).invite.update({
            where: { id },
            data: {
                revokedAt: new Date(),
            },
        });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// POST /api/team/invitations/accept - accept invitation and create user
router.post('/accept', async (req, res, next) => {
    try {
        const data = acceptInvitationSchema.parse(req.body);

        const invite = await (prisma as any).invite.findFirst({
            where: {
                token: data.token,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
        });

        if (!invite) {
            return res.status(400).json({ message: 'Invalid or expired invitation' });
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ username: data.username }],
            },
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User with this username or email already exists' });
        }

        const hashedPassword = await hashPassword(data.password);

        const roles = Array.isArray(invite.roles) ? (invite.roles as string[]) : [];

        const user = await (prisma as any).user.create({
            data: {
                username: data.username,
                email: invite.email,
                password: hashedPassword,
                displayName: data.displayName,
                isActive: true,
                roles: {
                    create: roles.map((roleId: string) => ({
                        roleId,
                    })),
                },
            },
        });

        await (prisma as any).invite.update({
            where: { id: invite.id },
            data: {
                acceptedAt: new Date(),
            },
        });

        res.status(201).json({
            id: (user as any).id,
            username: (user as any).username,
            email: (user as any).email,
            displayName: (user as any).displayName,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: (err as any).errors });
        }
        next(err);
    }
});

export default router;

