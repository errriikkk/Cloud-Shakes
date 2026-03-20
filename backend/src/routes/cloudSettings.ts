import express from 'express';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const DEFAULT_ID = 'default';

// Simple in-memory cache (avoid hitting DB on every upload)
let cache: { value: any; at: number } | null = null;
const CACHE_TTL_MS = 10_000;

export async function getCloudSettingsCached() {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

    const value = await (prisma as any).cloudSettings.upsert({
        where: { id: DEFAULT_ID },
        update: {},
        create: { id: DEFAULT_ID, storageLimitBytes: null, maxUploadSpeedKB: null },
    });

    cache = { value, at: Date.now() };
    return value;
}

// @route   GET /api/cloud-settings
// @desc    Get cloud/global limits config
// @access  Private (view_settings)
router.get('/', protect, requirePermission('view_settings'), async (_req, res, next) => {
    try {
        const settings = await getCloudSettingsCached();
        res.json({
            storageLimitBytes: settings.storageLimitBytes ? settings.storageLimitBytes.toString() : null,
            maxUploadSpeedKB: settings.maxUploadSpeedKB ?? null,
            updatedAt: settings.updatedAt,
        });
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/cloud-settings
// @desc    Update cloud/global limits config
// @access  Private (manage_settings)
router.put('/', protect, requirePermission('manage_settings'), async (req: AuthRequest, res, next) => {
    try {
        const { storageLimitBytes, maxUploadSpeedKB } = req.body || {};

        let nextStorage: bigint | null | undefined = undefined;
        if (storageLimitBytes === null) nextStorage = null;
        else if (typeof storageLimitBytes === 'string' || typeof storageLimitBytes === 'number') {
            const raw = BigInt(storageLimitBytes);
            if (raw < BigInt(0)) return res.status(400).json({ message: 'storageLimitBytes must be >= 0 or null' });
            nextStorage = raw;
        }

        let nextSpeed: number | null | undefined = undefined;
        if (maxUploadSpeedKB === null) nextSpeed = null;
        else if (typeof maxUploadSpeedKB === 'number') {
            if (!Number.isFinite(maxUploadSpeedKB) || maxUploadSpeedKB < 0) {
                return res.status(400).json({ message: 'maxUploadSpeedKB must be >= 0 or null' });
            }
            nextSpeed = Math.floor(maxUploadSpeedKB);
        }

        const updated = await (prisma as any).cloudSettings.upsert({
            where: { id: DEFAULT_ID },
            update: {
                ...(nextStorage !== undefined ? { storageLimitBytes: nextStorage } : {}),
                ...(nextSpeed !== undefined ? { maxUploadSpeedKB: nextSpeed } : {}),
                updatedById: req.user.id,
            },
            create: {
                id: DEFAULT_ID,
                storageLimitBytes: nextStorage === undefined ? null : nextStorage,
                maxUploadSpeedKB: nextSpeed === undefined ? null : nextSpeed,
                updatedById: req.user.id,
            },
        });

        cache = { value: updated, at: Date.now() };

        res.json({
            storageLimitBytes: updated.storageLimitBytes ? updated.storageLimitBytes.toString() : null,
            maxUploadSpeedKB: updated.maxUploadSpeedKB ?? null,
            updatedAt: updated.updatedAt,
        });
    } catch (err) {
        next(err);
    }
});

export default router;

