import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { hashPassword } from '../utils/auth';
import busboy from 'busboy';
import { minioClient, BUCKET_NAME } from '../utils/storage';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    password: z.string().min(6).optional(),
});

// @route   GET /api/profile
// @desc    Get current user profile
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isAdmin: true,
                storageLimit: true,
                createdAt: true,
            } as any,
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const apiBase =
            process.env.API_URL ||
            (process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin.replace('cloud.', 'api.') : null) ||
            'http://localhost:5000';

        // If avatar is a file ID, get the file URL (legacy)
        let avatarUrl = null;
        if (user.avatar) {
            try {
                // New private avatar storage (MinIO object key)
                if ((user as any).avatar.startsWith('avatars/')) {
                    avatarUrl = `${apiBase}/api/profile/avatar`;
                } else {
                // Check if avatar is a file ID
                const file = await prisma.file.findUnique({
                    where: { id: (user as any).avatar },
                    select: { storedName: true, mimeType: true },
                });
                if (file) {
                    avatarUrl = `${apiBase}/api/files/${user.avatar}/preview`;
                } else {
                    // Assume it's a URL
                    avatarUrl = user.avatar;
                }
                }
            } catch {
                avatarUrl = user.avatar;
            }
        }

        res.json({
            ...(user as any),
            avatarUrl,
            storageLimit: (user as any).storageLimit?.toString() ?? '53687091200',
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/profile/avatar
// @desc    Get current user's avatar (private)
// @access  Private
router.get('/avatar', protect, async (req: AuthRequest, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { avatar: true },
        });

        if (!user?.avatar || !(user as any).avatar.startsWith('avatars/')) {
            return res.status(404).json({ message: 'No avatar' });
        }

        const objectKey = (user as any).avatar as string;
        const stream = await minioClient.getObject(BUCKET_NAME, objectKey);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=300');
        stream.on('error', (err: any) => next(err));
        stream.pipe(res);
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/profile
// @desc    Update user profile
// @access  Private
router.put('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const data = updateProfileSchema.parse(req.body);

        const updateData: any = {};
        if (data.displayName !== undefined) {
            updateData.displayName = data.displayName;
        }
        if (data.password !== undefined) {
            updateData.password = await hashPassword(data.password);
        }

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isAdmin: true,
                storageLimit: true,
            } as any,
            data: updateData,
        });

        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   GET /api/profile/avatar/:userId
// @desc    Get a user's avatar (private to authenticated users)
// @access  Private
router.get('/avatar/:userId', protect, async (req: AuthRequest, res, next) => {
    try {
        const userId = String(req.params.userId);
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { avatar: true },
        });

        if (!target?.avatar || !(target as any).avatar.startsWith('avatars/')) {
            return res.status(404).json({ message: 'No avatar' });
        }

        const stream = await minioClient.getObject(BUCKET_NAME, (target as any).avatar);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=300');
        stream.on('error', (err: any) => next(err));
        stream.pipe(res);
    } catch (err) {
        next(err);
    }
});

// @route   DELETE /api/profile/avatar
// @desc    Remove current user's avatar
// @access  Private
router.delete('/avatar', protect, async (req: AuthRequest, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { avatar: true },
        });

        if (user?.avatar) {
            try {
                if ((user as any).avatar.startsWith('avatars/')) {
                    await minioClient.removeObject(BUCKET_NAME, (user as any).avatar);
                } else {
                    // legacy: avatar stored as File ID
                    const oldFile = await prisma.file.findUnique({ where: { id: (user as any).avatar } });
                    if (oldFile) {
                        await minioClient.removeObject(BUCKET_NAME, oldFile.storedName);
                        await prisma.file.delete({ where: { id: oldFile.id } });
                    }
                }
            } catch (err) {
                // best-effort cleanup
                console.error('Error deleting avatar:', err);
            }
        }

        const updated = await (prisma.user as any).update({
            where: { id: req.user.id },
            data: { avatar: null },
        });

        res.json({ ...updated, avatarUrl: null });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/profile/avatar
// @desc    Upload profile picture
// @access  Private
router.post('/avatar', protect, async (req: AuthRequest, res, next) => {
    const bb = busboy({ headers: req.headers });
    let fileUploaded = false;

    bb.on('file', async (name: string, file: any, info: any) => {
        const { filename, mimeType } = info;

        // Only allow image types
        if (!mimeType.startsWith('image/')) {
            file.resume();
            return res.status(400).json({ message: 'Only image files are allowed' });
        }

        fileUploaded = true;

        try {
            // Private avatar object (NOT a cloud "File")
            const storedName = `avatars/${req.user.id}/${uuidv4()}.jpg`;

            await minioClient.putObject(BUCKET_NAME, storedName, file, undefined as any, {
                'Content-Type': mimeType,
            });

            // Delete old avatar object if exists (private mode)
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { avatar: true },
            });

            if (user?.avatar) {
                try {
                    if ((user as any).avatar.startsWith('avatars/')) {
                        await minioClient.removeObject(BUCKET_NAME, (user as any).avatar);
                    }
                } catch (err) {
                    console.error('Error deleting old avatar:', err);
                }
            }

            // Update user avatar
            const updated = await (prisma.user as any).update({
                where: { id: req.user.id },
                data: { avatar: storedName },
            });

            const apiBase =
                process.env.API_URL ||
                (process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin.replace('cloud.', 'api.') : null) ||
                'http://localhost:5000';

            res.json({
                ...updated,
                avatarUrl: `${apiBase}/api/profile/avatar`,
            });
        } catch (err) {
            console.error('Avatar upload error:', err);
            res.status(500).json({ message: 'Failed to upload avatar' });
        }
    });

    bb.on('finish', () => {
        if (!fileUploaded) {
            res.status(400).json({ message: 'No file uploaded' });
        }
    });

    req.pipe(bb);
});

export default router;

