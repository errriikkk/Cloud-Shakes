import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/db';
import { protect, AuthRequest, requirePermission } from '../middleware/authMiddleware';
import { hashPassword } from '../utils/auth';

const router = express.Router();

const createInvitationSchema = z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    roleIds: z.array(z.string()).optional().default([]),
    expiresInHours: z.number().min(0.1).max(720).optional(),
}).refine(data => data.email || data.username, {
    message: "Debe proporcionar un email o un nombre de usuario.",
});

const acceptInvitationSchema = z.object({
    token: z.string().min(1),
    username: z.string().min(3).optional(),
    password: z.string().min(6),
    displayName: z.string().min(1).max(100),
});

// ─── IMPORTANT: /accept MUST be defined BEFORE /:token to avoid conflicts ───

// POST /api/team/invitations/accept - accept invitation and create user (PUBLIC)
router.post('/accept', async (req, res, next) => {
    try {
        console.log('[INVITE] POST /accept hit');
        console.log('[INVITE] Body keys:', Object.keys(req.body || {}));

        let data;
        try {
            data = acceptInvitationSchema.parse(req.body);
        } catch (zodErr: any) {
            console.log('[INVITE] Zod validation failed:', JSON.stringify(zodErr.errors));
            return res.status(400).json({
                message: 'Datos de formulario inválidos.',
                errors: zodErr.errors,
            });
        }

        console.log('[INVITE] Token received:', data.token.substring(0, 10) + '...');
        console.log('[INVITE] Token length:', data.token.length);
        console.log('[INVITE] Username:', data.username);
        console.log('[INVITE] DisplayName:', data.displayName);

        // First, find the invite by token only (no other filters) for debugging
        const rawInvite = await (prisma as any).invite.findUnique({
            where: { token: data.token },
        });

        if (!rawInvite) {
            // List all invites for debugging
            const allInvites = await (prisma as any).invite.findMany({
                select: { id: true, token: true, expiresAt: true, acceptedAt: true, revokedAt: true },
            });
            console.log('[INVITE] No invite found for token. Total invites in DB:', allInvites.length);
            allInvites.forEach((inv: any) => {
                console.log(`[INVITE]   - ${inv.token.substring(0, 10)}... expires=${inv.expiresAt} accepted=${inv.acceptedAt} revoked=${inv.revokedAt}`);
            });
            return res.status(400).json({ message: 'Invitación no encontrada. El enlace puede ser incorrecto.' });
        }

        console.log('[INVITE] Found invite:', rawInvite.id);
        console.log('[INVITE] Invite status: accepted=', rawInvite.acceptedAt, 'revoked=', rawInvite.revokedAt, 'expires=', rawInvite.expiresAt);

        // Check specific conditions and return specific errors
        if (rawInvite.acceptedAt) {
            return res.status(400).json({ message: 'Esta invitación ya ha sido utilizada.' });
        }
        if (rawInvite.revokedAt) {
            return res.status(400).json({ message: 'Esta invitación ha sido revocada por un administrador.' });
        }
        if (new Date(rawInvite.expiresAt) < new Date()) {
            return res.status(400).json({ message: 'Esta invitación ha caducado. Pide una nueva al administrador.' });
        }

        const finalUsername = rawInvite.username || data.username;
        if (!finalUsername) {
            return res.status(400).json({ message: 'Se requiere un nombre de usuario.' });
        }

        // Check for existing user
        const existingUser = await (prisma as any).user.findFirst({
            where: {
                OR: [
                    { username: finalUsername },
                    ...(rawInvite.email ? [{ email: rawInvite.email }] : [])
                ]
            },
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Ya existe un usuario con ese nombre de usuario o email.' });
        }

        const hashedPassword = await hashPassword(data.password);
        const roles = Array.isArray(rawInvite.roles) ? (rawInvite.roles as string[]) : [];

        const user = await (prisma as any).user.create({
            data: {
                username: finalUsername,
                email: rawInvite.email || null,
                password: hashedPassword,
                displayName: data.displayName,
                isActive: true,
                roles: roles.length > 0 ? {
                    create: roles.map((roleId: string) => ({
                        roleId,
                    })),
                } : undefined,
            },
        });

        await (prisma as any).invite.update({
            where: { id: rawInvite.id },
            data: { acceptedAt: new Date() },
        });

        console.log('[INVITE] User created successfully:', user.id, user.username);

        res.status(201).json({
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
        });
    } catch (err: any) {
        console.error('[INVITE] Unexpected error in /accept:', err.message, err.stack);
        next(err);
    }
});

// GET /api/team/invitations/info/:token - get invitation info (PUBLIC)
router.get('/info/:token', async (req, res, next) => {
    try {
        const { token } = req.params;
        console.log('[INVITE] GET /info/:token - token:', token.substring(0, 10) + '...');

        const invite = await (prisma as any).invite.findUnique({
            where: { token }
        });

        if (!invite) {
            return res.status(404).json({ message: 'Invitación no encontrada.' });
        }
        if (invite.acceptedAt) {
            return res.status(410).json({ message: 'Esta invitación ya ha sido utilizada.' });
        }
        if (invite.revokedAt) {
            return res.status(410).json({ message: 'Esta invitación ha sido revocada.' });
        }
        if (new Date(invite.expiresAt) < new Date()) {
            return res.status(410).json({ message: 'Esta invitación ha caducado.' });
        }

        res.json({
            email: invite.email,
            username: invite.username,
            expiresAt: invite.expiresAt,
            valid: true,
        });
    } catch (err) {
        next(err);
    }
});

// ─── Protected routes ────────────────────────────────────────────────────────

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
                username: inv.username,
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

        let validRoles: any[] = [];
        if (data.roleIds && data.roleIds.length > 0) {
            validRoles = await (prisma as any).role.findMany({
                where: { id: { in: data.roleIds } },
            });
            if (validRoles.length !== data.roleIds.length) {
                return res.status(400).json({ message: 'Algunos roles proporcionados no son válidos' });
            }
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (data.expiresInHours ?? 72) * 60 * 60 * 1000);

        const invite = await (prisma as any).invite.create({
            data: {
                email: data.email || null,
                username: data.username || null,
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
            username: invite.username,
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
            data: { revokedAt: new Date() },
        });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
