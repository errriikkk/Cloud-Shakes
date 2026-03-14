import express from 'express';
import busboy from 'busboy';
import prisma from '../config/db';
import { minioClient, BUCKET_NAME, getPresignedUrl } from '../utils/storage';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { ThrottledStream } from '../utils/throttle';
import { LIMITS } from '../config/limits';
import { createActivity } from './activity';

const router = express.Router();

// Allowed MIME types for uploads (whitelist)
const ALLOWED_MIME_TYPES = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'image/bmp', 'image/tiff', 'image/x-icon',
    // Documents
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
    'application/json', 'application/xml', 'text/xml',
    // Archives
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed', 'application/vnd.rar',
    'application/x-tar', 'application/gzip', 'application/x-gzip',
    // Audio/Video
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
    'video/mp4', 'video/webm', 'video/ogg', 'video/mpeg',
    // Other
    'application/octet-stream', 'application/javascript'
];

// Helper to validate MIME type
const isMimeTypeAllowed = (mimeType: string): boolean => {
    return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
};

// @route   GET /api/files/usage
// @desc    Get current user's storage usage and limit
// @access  Private - requires view_files permission
router.get('/usage', protect, requirePermission('view_files'), async (req: AuthRequest, res, next) => {
    try {
        const result = await prisma.file.aggregate({
            // Storage limit is still per user (owner)
            where: { ownerId: req.user.id },
            _sum: { size: true },
        });

        const used = result._sum.size ?? BigInt(0);
        const limit = req.user.storageLimit ?? LIMITS.DEFAULT_STORAGE_LIMIT;

        res.json({
            used: used.toString(),
            limit: limit.toString(),
        });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/files/upload
// @desc    Upload a file (Streaming + Throttling)
// @access  Private
router.post('/upload', protect, requirePermission('upload_files'), async (req: AuthRequest, res, next) => {
    const bb = busboy({ headers: req.headers });
    let fileUploaded = false;
    let folderId: string | null = null;

    bb.on('field', (name: string, val: string) => {
        if (name === 'folderId' && val) {
            folderId = val;
        }
    });

    bb.on('file', async (name: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        fileUploaded = true;

        // Validate MIME type
        if (!isMimeTypeAllowed(mimeType)) {
            file.resume();
            return res.status(400).json({ message: 'File type not allowed. Only safe file types are accepted.' });
        }

        try {
            // Storage Limit Check
            const result = await prisma.file.aggregate({
                where: { ownerId: req.user.id },
                _sum: { size: true },
            });
            const currentUsage = BigInt(result._sum.size ?? 0);
            const storageLimit = BigInt(req.user.storageLimit ?? LIMITS.DEFAULT_STORAGE_LIMIT);

            const contentLength = req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0;
            if (contentLength > 0 && currentUsage + BigInt(contentLength) > storageLimit) {
                file.resume();
                return res.status(413).json({ message: 'Storage limit exceeded.' });
            }

            const storedName = `${uuidv4()}-${filename}`;
            const uploadSpeedBytes = LIMITS.MAX_UPLOAD_SPEED * 1024;

            let streamToMinio: any = file;
            if (uploadSpeedBytes > 0) {
                const throttler = new ThrottledStream(uploadSpeedBytes);
                streamToMinio = file.pipe(throttler);
            }

            await minioClient.putObject(BUCKET_NAME, storedName, streamToMinio, undefined as any, {
                'Content-Type': mimeType,
            });

            const stat = await minioClient.statObject(BUCKET_NAME, storedName);

            const newFile = await prisma.file.create({
                data: {
                    originalName: filename,
                    storedName: storedName,
                    mimeType: mimeType,
                    size: BigInt(stat.size),
                    ownerId: req.user.id,
                    folderId: folderId || null,
                },
            });

            // Log activity
            await createActivity(
                req.user.id,
                'file',
                'upload',
                newFile.id,
                'file',
                filename
            );

            res.json({
                ...newFile,
                size: newFile.size.toString(),
            });

        } catch (err: any) {
            next(err);
        }
    });

    bb.on('close', () => {
        if (!fileUploaded && !res.headersSent) {
            res.status(400).json({ message: 'No file uploaded' });
        }
    });

    bb.on('error', (err: any) => {
        next(err);
    });

    req.pipe(bb);
});

// @route   GET /api/files
// @desc    List user files
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const { folderId, page = '1', limit = '50' } = req.query;
        const pageNum = Math.min(Math.max(parseInt(page as string) || 1, 1), 100);
        const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        // Check if user has workspace permission to see all files
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        const [files, total] = await Promise.all([
            prisma.file.findMany({
                where: canViewAll
                    ? { folderId: folderId ? (folderId as string) : null }
                    : { ownerId: req.user.id, folderId: folderId ? (folderId as string) : null },
                include: {
                    owner: { select: { id: true, username: true, displayName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.file.count({
                where: canViewAll
                    ? { folderId: folderId ? (folderId as string) : null }
                    : { ownerId: req.user.id, folderId: folderId ? (folderId as string) : null },
            }),
        ]);
        res.json({
            data: files.map(f => ({ ...f, size: f.size.toString() })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/files/:id
// @desc    Get file details
// @access  Private
router.get('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const file = await prisma.file.findUnique({
            where: { id: req.params.id as string },
            include: {
                owner: { select: { id: true, username: true, displayName: true } },
            }
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check if user can view this file (owner, admin, or has workspace permission)
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        if (file.ownerId !== req.user.id && !canViewAll) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.json(file);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/files/bulk-delete
// @desc    Delete multiple files
// @access  Private
router.post('/bulk-delete', protect, requirePermission('delete_files'), async (req: AuthRequest, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No file IDs provided' });
        }

        const files = await prisma.file.findMany({
            where: {
                id: { in: ids },
                ownerId: req.user.id
            }
        });

        for (const file of files) {
            try {
                await minioClient.removeObject(BUCKET_NAME, file.storedName);
            } catch (err) {
                console.error(`Failed to remove ${file.storedName} from MinIO during bulk delete:`, err);
            }
        }

        await prisma.file.deleteMany({
            where: {
                id: { in: files.map(f => f.id) }
            }
        });

        res.json({ message: `${files.length} files removed` });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/files/bulk-move
// @desc    Move multiple files
// @access  Private
router.post('/bulk-move', protect, requirePermission('upload_files'), async (req: AuthRequest, res, next) => {
    try {
        const { ids, targetFolderId } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No file IDs provided' });
        }

        if (targetFolderId) {
            const targetFolder = await prisma.folder.findUnique({
                where: { id: targetFolderId },
            });
            if (!targetFolder || (targetFolder.ownerId !== req.user.id && !req.user.isAdmin)) {
                return res.status(404).json({ message: 'Target folder not found or unauthorized' });
            }
        }

        await prisma.file.updateMany({
            where: {
                id: { in: ids },
                ownerId: req.user.id
            },
            data: { folderId: targetFolderId || null }
        });

        res.json({ message: `${ids.length} files moved` });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/files/:id/preview
// @desc    Get a presigned URL for file preview (images, etc.)
// @access  Private
router.get('/:id/preview', protect, async (req: AuthRequest, res, next) => {
    try {
        const file = await prisma.file.findUnique({
            where: { id: req.params.id as string },
        });

        if (!file) return res.status(404).json({ message: 'File not found' });

        // Check if user can view this file (owner, admin, or has workspace permission)
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        if (file.ownerId !== req.user.id && !canViewAll) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const url = await getPresignedUrl(file.storedName, 60 * 60);
        res.json({ url });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/files/:id/download
// @desc    Download file (Proxied + Throttled)
// @access  Private
router.get('/:id/download', protect, async (req: AuthRequest, res, next) => {
    try {
        const file = await prisma.file.findUnique({
            where: { id: req.params.id as string },
        });

        if (!file) return res.status(404).json({ message: 'File not found' });

        if (file.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_files')) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const safeFilename = encodeURIComponent(file.originalName);
        const downloadSpeedKB = parseInt(process.env.MAX_DOWNLOAD_SPEED || '0');
        const downloadSpeedBytes = downloadSpeedKB * 1024;
        const shouldThrottle = downloadSpeedBytes > 0;

        try {
            const stat = await minioClient.statObject(BUCKET_NAME, file.storedName);
            const fileSize = stat.size;
            const range = req.headers.range;

            let dataStream;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                dataStream = await minioClient.getPartialObject(BUCKET_NAME, file.storedName, start, chunksize);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': file.mimeType,
                    'Content-Disposition': `attachment; filename="${safeFilename}"`,
                });
            } else {
                dataStream = await minioClient.getObject(BUCKET_NAME, file.storedName);

                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': file.mimeType,
                    'Content-Disposition': `attachment; filename="${safeFilename}"`,
                    'Accept-Ranges': 'bytes',
                });
            }

            dataStream.on('error', (err: any) => {
                console.error('[DOWNLOAD] Stream Error', err);
                res.end();
            });

            if (shouldThrottle) {
                const throttler = new ThrottledStream(downloadSpeedBytes);
                dataStream.pipe(throttler).pipe(res);
            } else {
                dataStream.pipe(res);
            }
        } catch (minioErr) {
            next(minioErr);
        }
    } catch (err) {
        next(err);
    }
});

// @route   DELETE /api/files/:id
// @desc    Delete a file
// @access  Private
router.delete('/:id', protect, requirePermission('delete_files'), async (req: AuthRequest, res, next) => {
    try {
        const file = await prisma.file.findUnique({
            where: { id: req.params.id as string },
        });

        if (!file) return res.status(404).json({ message: 'File not found' });

        if (file.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_files')) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await minioClient.removeObject(BUCKET_NAME, file.storedName);
        await prisma.file.delete({
            where: { id: req.params.id as string },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'file',
            'delete',
            req.params.id as string,
            'file',
            file.originalName
        );

        res.json({ message: 'File removed' });
    } catch (err) {
        next(err);
    }
});

// @route   PATCH /api/files/:id/move
// @desc    Move a file
// @access  Private
router.patch('/:id/move', protect, async (req: AuthRequest, res, next) => {
    try {
        const id = req.params.id as string;
        const { targetFolderId } = req.body; // null means root

        const file = await prisma.file.findUnique({
            where: { id },
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        if (file.ownerId !== req.user.id && !req.user.isAdmin && !(req.user.permissions || []).includes('view_files')) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // If moving to a target folder, verify it exists and is owned by the same user
        if (targetFolderId) {
            const targetFolder = await prisma.folder.findUnique({
                where: { id: targetFolderId },
            });

            if (!targetFolder) {
                return res.status(404).json({ message: 'Target folder not found' });
            }

            if (targetFolder.ownerId !== req.user.id && !req.user.isAdmin) {
                return res.status(401).json({ message: 'Not authorized to target folder' });
            }
        }

        const updatedFile = await prisma.file.update({
            where: { id },
            data: { folderId: targetFolderId || null },
        });

        res.json({
            ...updatedFile,
            size: updatedFile.size.toString(),
        });
    } catch (err) {
        next(err);
    }
});


export default router;
