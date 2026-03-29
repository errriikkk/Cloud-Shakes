import express from 'express';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// @route   GET /api/activity
// @desc    Get activity log with search, filter, sort, and pagination
// @access  Private - requires view_activity permission
router.get('/', protect, requirePermission('view_activity'), async (req: AuthRequest, res, next) => {
    try {
        const { 
            page = '1', 
            limit = '50', 
            search = '',
            type,
            action,
            userId,
            startDate,
            endDate,
            sort = 'desc'
        } = req.query;

        const pageNum = Math.min(Math.max(parseInt(page as string) || 1, 1), 100);
        const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        // Build where clause
        const where: any = {};
        
        // Search in action, resourceName, type
        if (search) {
            where.OR = [
                { action: { contains: search as string, mode: 'insensitive' } },
                { resourceName: { contains: search as string, mode: 'insensitive' } },
                { type: { contains: search as string, mode: 'insensitive' } },
            ];
        }
        
        // Filter by type (category)
        if (type) where.type = type;
        
        // Filter by action
        if (action) where.action = action;
        
        // Filter by user
        if (userId) where.ownerId = userId;
        
        // Filter by date range
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate as string);
            if (endDate) where.createdAt.lte = new Date(endDate as string);
        }

        const [activities, total] = await Promise.all([
            prisma.activity.findMany({
                where,
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                skip,
                take: limitNum,
                include: {
                    owner: { select: { id: true, username: true, displayName: true, avatar: true } },
                },
            }),
            prisma.activity.count({ where }),
        ]);

        // Get unique types for filter dropdown
        const types = await prisma.activity.findMany({
            select: { type: true },
            distinct: ['type'],
            orderBy: { type: 'asc' }
        });

        // Get unique actions for filter dropdown
        const actions = await prisma.activity.findMany({
            select: { action: true },
            distinct: ['action'],
            orderBy: { action: 'asc' }
        });

        // Get users for filter dropdown
        const users = await prisma.activity.findMany({
            select: { owner: { select: { id: true, username: true, displayName: true } } },
            distinct: ['ownerId'],
            take: 50
        });

        res.json({
            data: activities,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
            filters: {
                types: types.map(t => t.type).filter(Boolean),
                actions: actions.map(a => a.action).filter(Boolean),
                users: users.map(u => u.owner).filter(Boolean),
            }
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/activity/stats
// @desc    Get activity statistics
// @access  Private - requires view_activity permission
router.get('/stats', protect, requirePermission('view_activity'), async (req: AuthRequest, res, next) => {
    try {
        const { days = '7' } = req.query;
        const daysNum = parseInt(days as string) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);

        // Activity by type
        const byType = await prisma.activity.groupBy({
            by: ['type'],
            where: { createdAt: { gte: startDate } },
            _count: true,
            orderBy: { _count: { type: 'desc' } }
        });

        // Activity by action
        const byAction = await prisma.activity.groupBy({
            by: ['action'],
            where: { createdAt: { gte: startDate } },
            _count: true,
            orderBy: { _count: { action: 'desc' } }
        });

        // Activity by day
        const byDay = await prisma.$queryRaw`
            SELECT DATE(createdAt) as date, COUNT(*) as count 
            FROM "Activity" 
            WHERE "createdAt" >= ${startDate}
            GROUP BY DATE("createdAt")
            ORDER BY date DESC
        `;

        // Top users
        const topUsers = await prisma.activity.groupBy({
            by: ['ownerId'],
            where: { createdAt: { gte: startDate } },
            _count: true,
            orderBy: { _count: { ownerId: 'desc' } },
            take: 10
        });

        // Get user details for top users
        const userIds = topUsers.map(u => u.ownerId);
        const userDetails = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, displayName: true }
        });

        const topUsersWithDetails = topUsers.map(u => ({
            userId: u.ownerId,
            count: u._count,
            user: userDetails.find(d => d.id === u.ownerId)
        }));

        res.json({
            byType: byType.map(t => ({ type: t.type, count: t._count })),
            byAction: byAction.map(a => ({ action: a.action, count: a._count })),
            byDay: byDay,
            topUsers: topUsersWithDetails,
            total: await prisma.activity.count({ where: { createdAt: { gte: startDate } } })
        });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/activity
// @desc    Create activity entry (for speed test and other internal uses)
// @access  Private
router.post('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const { type, action, resourceId, resourceType, resourceName, metadata } = req.body;
        
        if (type === 'speed_test') {
            // Just acknowledge the speed test request, don't create activity
            return res.json({ success: true });
        }

        const activity = await prisma.activity.create({
            data: {
                ownerId: req.user.id,
                type: type || 'system',
                action: action || 'create',
                resourceId,
                resourceType,
                resourceName,
                metadata: metadata || undefined,
            }
        });
        
        res.json(activity);
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

