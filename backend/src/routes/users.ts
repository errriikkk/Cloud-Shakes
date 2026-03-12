import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest, requirePermission } from '../middleware/authMiddleware';

const router = express.Router();

const updateUserSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    roles: z.array(z.string()).optional(), // array of role IDs
});

// GET /api/users - list users with roles
router.get('/', protect, requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'asc' },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        const result = users.map((u) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            displayName: u.displayName,
            isAdmin: u.isAdmin,
            isActive: u.isActive,
            createdAt: u.createdAt,
            roles: u.roles.map((ur) => ({
                id: ur.role.id,
                name: ur.role.name,
            })),
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/users/:id - update user (status, displayName, roles)
router.patch('/:id', protect, requirePermission('manage_users'), async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;
        const data = updateUserSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { id },
            include: { roles: true },
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateData: any = {};
        if (data.displayName !== undefined) {
            updateData.displayName = data.displayName;
        }
        if (data.isActive !== undefined) {
            updateData.isActive = data.isActive;
        }

        const rolesToAssign = data.roles
            ? await prisma.role.findMany({
                  where: { id: { in: data.roles } },
              })
            : null;

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...updateData,
                roles: rolesToAssign
                    ? {
                          deleteMany: {},
                          create: rolesToAssign.map((r) => ({
                              roleId: r.id,
                          })),
                      }
                    : undefined,
            },
            include: {
                roles: { include: { role: true } },
            },
        });

        res.json({
            id: updated.id,
            username: updated.username,
            email: updated.email,
            displayName: updated.displayName,
            isAdmin: updated.isAdmin,
            isActive: updated.isActive,
            createdAt: updated.createdAt,
            roles: updated.roles.map((ur) => ({
                id: ur.role.id,
                name: ur.role.name,
            })),
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: (err as any).errors });
        }
        next(err);
    }
});

export default router;

