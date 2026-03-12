import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest, requirePermission } from '../middleware/authMiddleware';

const router = express.Router();

const roleSchema = z.object({
    name: z.string().min(1),
    description: z.string().max(255).optional(),
    isSystem: z.boolean().optional(),
    permissions: z.array(z.string()).optional(), // array of permission keys
});

// GET /api/roles - list roles with permissions
router.get('/', protect, requirePermission('manage_roles'), async (req: AuthRequest, res, next) => {
    try {
        const roles = await (prisma as any).role.findMany({
            include: {
                permissions: {
                    include: {
                        permission: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        const result = roles.map((role: any) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissions: role.permissions.map((rp: any) => rp.permission.key),
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/roles - create role
router.post('/', protect, requirePermission('manage_roles'), async (req: AuthRequest, res, next) => {
    try {
        const data = roleSchema.parse(req.body);
        const permissionKeys = data.permissions || [];

        const created = await prisma.$transaction(async (tx: any) => {
            // 1. Create role
            const role = await tx.role.create({
                data: {
                    name: data.name,
                    description: data.description,
                    isSystem: data.isSystem ?? false,
                },
            });

            // 2. Ensure Permission rows exist for all keys and link them
            if (permissionKeys.length > 0) {
                const permissionRecords: any[] = [];
                for (const key of permissionKeys) {
                    const perm = await tx.permission.upsert({
                        where: { key },
                        update: {},
                        create: { key },
                    });
                    permissionRecords.push(perm);
                }

                await tx.rolePermission.createMany({
                    data: permissionRecords.map((p: any) => ({
                        roleId: role.id,
                        permissionId: p.id,
                    })),
                });
            }

            // 3. Return role with permissions
            return tx.role.findUnique({
                where: { id: role.id },
                include: {
                    permissions: { include: { permission: true } },
                },
            });
        });

        res.status(201).json({
            id: created.id,
            name: created.name,
            description: created.description,
            isSystem: created.isSystem,
            permissions: created.permissions.map((rp: any) => rp.permission.key),
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: (err as any).errors });
        }
        next(err);
    }
});

// PATCH /api/roles/:id - update role (except system flags on system roles)
router.patch('/:id', protect, requirePermission('manage_roles'), async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;
        const data = roleSchema.partial().parse(req.body);

        const existing = await (prisma as any).role.findUnique({
            where: { id },
            include: { permissions: true },
        });

        if (!existing) {
            return res.status(404).json({ message: 'Role not found' });
        }

        if (existing.isSystem && data.isSystem === false) {
            return res.status(400).json({ message: 'Cannot change system flag of system role' });
        }

        const permissionKeys = data.permissions ?? null;
        let updated;

        if (permissionKeys !== null) {
            // Update role and replace all permissions using a transaction
            updated = await prisma.$transaction(async (tx: any) => {
                // 1. Update basic role info
                await tx.role.update({
                    where: { id },
                    data: {
                        name: data.name ?? existing.name,
                        description: data.description ?? existing.description,
                    },
                });

                // 2. Wipe old permissions
                await tx.rolePermission.deleteMany({
                    where: { roleId: id },
                });

                // 3. Ensure Permission rows and recreate links
                if (permissionKeys.length > 0) {
                    const permissionRecords: any[] = [];
                    for (const key of permissionKeys) {
                        const perm = await tx.permission.upsert({
                            where: { key },
                            update: {},
                            create: { key },
                        });
                        permissionRecords.push(perm);
                    }

                    await tx.rolePermission.createMany({
                        data: permissionRecords.map((p: any) => ({
                            roleId: id,
                            permissionId: p.id,
                        })),
                    });
                }

                // 4. Return updated role with permissions
                return await tx.role.findUnique({
                    where: { id },
                    include: {
                        permissions: { include: { permission: true } },
                    },
                });
            });
        } else {
            // Just update basic info
            updated = await (prisma as any).role.update({
                where: { id },
                data: {
                    name: data.name ?? existing.name,
                    description: data.description ?? existing.description,
                },
                include: {
                    permissions: { include: { permission: true } },
                },
            });
        }

        res.json({
            id: updated.id,
            name: updated.name,
            description: updated.description,
            isSystem: updated.isSystem,
            permissions: updated.permissions.map((rp: any) => rp.permission.key),
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: (err as any).errors });
        }
        next(err);
    }
});

// DELETE /api/roles/:id - delete role (not allowed for system roles)
router.delete('/:id', protect, requirePermission('manage_roles'), async (req: AuthRequest, res, next) => {
    try {
        const { id } = req.params;

        const role = await (prisma as any).role.findUnique({ where: { id } });
        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }

        if (role.isSystem) {
            return res.status(400).json({ message: 'Cannot delete system role' });
        }

        await (prisma as any).role.delete({ where: { id } });
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;

