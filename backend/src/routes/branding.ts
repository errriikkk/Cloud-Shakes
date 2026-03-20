import express from 'express';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

const DEFAULT_ID = 'default';

// @route   GET /api/branding
// @desc    Public branding for the instance
// @access  Public
router.get('/', async (_req, res, next) => {
    try {
        const branding = await (prisma as any).branding.upsert({
            where: { id: DEFAULT_ID },
            update: {},
            create: { id: DEFAULT_ID, cloudName: 'Cloud Shakes', logoUrl: null },
        });

        res.json({
            cloudName: branding.cloudName,
            logoUrl: branding.logoUrl,
        });
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/branding
// @desc    Update branding (name + logo)
// @access  Private (manage_settings)
router.put('/', protect, requirePermission('manage_settings'), async (req: AuthRequest, res, next) => {
    try {
        const { cloudName, logoUrl } = req.body || {};

        const nextName = typeof cloudName === 'string' ? cloudName.trim() : undefined;
        const nextLogo = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;

        if (nextName !== undefined && nextName.length < 2) {
            return res.status(400).json({ message: 'cloudName too short' });
        }

        const updated = await (prisma as any).branding.upsert({
            where: { id: DEFAULT_ID },
            update: {
                ...(nextName !== undefined ? { cloudName: nextName } : {}),
                ...(nextLogo !== undefined ? { logoUrl: nextLogo || null } : {}),
                updatedById: req.user.id,
            },
            create: {
                id: DEFAULT_ID,
                cloudName: nextName || 'Cloud Shakes',
                logoUrl: nextLogo || null,
                updatedById: req.user.id,
            },
        });

        res.json({
            cloudName: updated.cloudName,
            logoUrl: updated.logoUrl,
        });
    } catch (err) {
        next(err);
    }
});

export default router;

