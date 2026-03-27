import express, { Request, Response } from 'express';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import webpush from 'web-push';

// Generate VAPID keys on startup if not provided
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-FbRouAf7-7OTt9GH4o-4I9PZmT3YHyF7fKc';

// Configure web-push
webpush.setVapidDetails(
    'mailto:admin@shakes.cloud',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

const router = express.Router();

// Get VAPID public key for frontend subscription
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Store push subscriptions
router.post('/subscribe', protect, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: 'Invalid subscription data' });
        }

        // Upsert subscription
        await prisma.pushSubscription.upsert({
            where: {
                userId_endpoint: {
                    userId,
                    endpoint,
                },
            },
            update: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
            create: {
                userId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving push subscription:', err);
        res.status(500).json({ message: 'Failed to save subscription' });
    }
});

// Unsubscribe from push notifications
router.delete('/subscribe', protect, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { endpoint } = req.body as { endpoint: string };

        await prisma.pushSubscription.deleteMany({
            where: {
                userId,
                endpoint,
            },
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error removing push subscription:', err);
        res.status(500).json({ message: 'Failed to remove subscription' });
    }
});

// Get user's push subscriptions
router.get('/subscriptions', protect, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const result = await prisma.pushSubscription.findMany({
            where: { userId },
            select: {
                id: true,
                endpoint: true,
                createdAt: true,
            },
        });

        res.json(result);
    } catch (err) {
        console.error('Error getting push subscriptions:', err);
        res.status(500).json({ message: 'Failed to get subscriptions' });
    }
});

// Send push notification to a user
router.post('/send', protect, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { title, body, data } = req.body as { title: string; body: string; data?: any };

        // Get user's subscriptions
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId },
            select: {
                endpoint: true,
                p256dh: true,
                auth: true,
            },
        });

        if (subscriptions.length === 0) {
            return res.status(404).json({ message: 'No push subscriptions found' });
        }

        const notificationPayload = JSON.stringify({
            title,
            body,
            icon: '/logo-192.png',
            badge: '/logo-192.png',
            data,
            tag: data?.type || 'shakes-notification',
        });

        let sentCount = 0;
        let failedCount = 0;

        // Send push notification to each subscription
        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth,
                        },
                    },
                    notificationPayload
                );
                sentCount++;
            } catch (error: any) {
                console.error('[Push] Error sending to subscription:', error.message);
                failedCount++;
                
                // If subscription is no longer valid (410 Gone), delete it
                if (error.statusCode === 410) {
                    await prisma.pushSubscription.deleteMany({
                        where: {
                            userId,
                            endpoint: sub.endpoint,
                        },
                    });
                }
            }
        }

        res.json({ 
            success: true, 
            sent: sentCount,
            failed: failedCount,
        });
    } catch (err) {
        console.error('Error sending push notification:', err);
        res.status(500).json({ message: 'Failed to send notification' });
    }
});

export default router;
