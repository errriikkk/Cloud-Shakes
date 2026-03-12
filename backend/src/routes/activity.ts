import express from 'express';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// @route   GET /api/activity
// @desc    Get recent activity for the whole workspace (instance)
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const activities = await prisma.activity.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });

        res.json(activities);
    } catch (err) {
        next(err);
    }
});

// Helper function to create activity (can be imported by other routes)
export const createActivity = async (
    userId: string,
    type: string,
    action: string,
    resourceId?: string,
    resourceType?: string,
    resourceName?: string,
    metadata?: any
) => {
    try {
        await prisma.activity.create({
            data: {
                type,
                action,
                resourceId,
                resourceType,
                resourceName,
                ownerId: userId,
                metadata: metadata || {},
            },
        });
    } catch (err) {
        console.error('Error creating activity:', err);
        // Don't throw - activity logging should not break the main flow
    }
};

export default router;

