import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';
import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from '../utils/auth';
import { ThrottledStream } from '../utils/throttle';
import { minioClient, BUCKET_NAME } from '../utils/storage';

const router = express.Router();

const createLinkSchema = z.object({
    fileId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    password: z.string().optional(),
    expiresInMinutes: z.number().optional(),
    directDownload: z.boolean().optional(),
    isEmbed: z.boolean().optional(),
    customSlug: z.string().optional(),
}).refine(data => data.fileId || data.folderId, {
    message: "Debe proporcionar fileId o folderId"
});

const updateLinkSchema = z.object({
    password: z.string().nullable().optional(),
    expiresInMinutes: z.number().nullable().optional(),
    removePassword: z.boolean().optional(),
    directDownload: z.boolean().optional(),
    isEmbed: z.boolean().optional(),
    customSlug: z.string().nullable().optional(),
});

// @route   GET /api/links/stats
// @desc    Get link statistics and analytics
// @access  Private - requires view_links permission
router.get('/stats', protect, requirePermission('view_links'), async (req: AuthRequest, res, next) => {
    try {
        const links = await (prisma.link as any).findMany({
            where: { creatorId: req.user.id },
            select: {
                id: true,
                views: true,
                createdAt: true,
                type: true,
                expiresAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Calculate statistics
        const totalLinks = links.length;
        const totalViews = (links as any[]).reduce((sum: number, link: any) => sum + link.views, 0);
        const activeLinks = (links as any[]).filter((link: any) => !link.expiresAt || new Date(link.expiresAt) > new Date()).length;
        const expiredLinks = (links as any[]).filter((link: any) => link.expiresAt && new Date(link.expiresAt) <= new Date()).length;

        // Views by hour (last 24 hours) - placeholder for future tracking
        const viewsByHour: Record<number, number> = {};
        for (let i = 0; i < 24; i++) {
            viewsByHour[i] = 0;
        }

        // Views by day (last 30 days) - placeholder for future tracking
        const viewsByDay: Record<string, number> = {};
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            viewsByDay[dateStr] = 0;
        }

        // Links by type
        const linksByType: Record<string, number> = {};
        (links as any[]).forEach((link: any) => {
            linksByType[link.type] = (linksByType[link.type] || 0) + 1;
        });

        // Most viewed links
        const mostViewed = (links as any[])
            .sort((a: any, b: any) => b.views - a.views)
            .slice(0, 10)
            .map((link: any) => ({
                id: link.id,
                views: link.views,
                type: link.type,
            }));

        res.json({
            totalLinks,
            totalViews,
            activeLinks,
            expiredLinks,
            viewsByHour,
            viewsByDay,
            linksByType,
            mostViewed,
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/links
// @desc    List all links for the current user
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const links = await (prisma.link as any).findMany({
            where: { creatorId: req.user.id },
            include: {
                file: {
                    include: {
                        folder: true
                    }
                },
                folder: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Auto-delete links for files that no longer exist (orphaned links)
        const orphanedLinkIds: string[] = [];
        for (const link of links) {
            if (link.type === 'file' && link.fileId && !link.file) {
                orphanedLinkIds.push(link.id);
            } else if (link.type === 'folder' && link.folderId && !link.folder) {
                orphanedLinkIds.push(link.id);
            }
        }

        // Delete orphaned links in background (don't block response)
        if (orphanedLinkIds.length > 0) {
            (prisma.link as any).deleteMany({
                where: { id: { in: orphanedLinkIds } }
            }).catch((err: any) => {
                console.error('Error auto-deleting orphaned links:', err);
            });
        }

        // Filter out orphaned links from response
        const validLinks = (links as any[]).filter((link: any) => {
            if (link.type === 'file' && link.fileId && !link.file) return false;
            if (link.type === 'folder' && link.folderId && !link.folder) return false;
            return true;
        });

        const linksWithStatus = validLinks.map((link: any) => {
            const l = link as any;
            return {
                ...l,
                isExpired: l.expiresAt ? l.expiresAt < new Date() : false,
                isPasswordProtected: !!l.password,
                password: undefined, // Never expose hashed password
                file: l.file ? { ...l.file, size: l.file.size.toString() } : null,
                folder: l.folder || (l.file && l.file.folder ? l.file.folder : null),
            };
        });

        res.json(linksWithStatus);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/links
// @desc    Create a shareable link (for files or folders)
// @access  Private
router.post('/', protect, requirePermission('share_files'), async (req: AuthRequest, res, next) => {
    try {
        const { fileId, folderId, password, expiresInMinutes, directDownload, isEmbed, customSlug } = createLinkSchema.parse(req.body);

        // Security: Validate and sanitize customSlug
        let sanitizedCustomSlug: string | null = null;
        if (customSlug) {
            // Only allow alphanumeric, hyphens, and underscores, max 50 chars
            const slugRegex = /^[a-zA-Z0-9_-]{1,50}$/;
            if (!slugRegex.test(customSlug)) {
                return res.status(400).json({ message: 'Custom slug contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.' });
            }
            // Check if slug already exists
            const existingLink = await prisma.link.findUnique({
                where: { id: customSlug }
            });
            if (existingLink) {
                return res.status(409).json({ message: 'This custom slug is already in use' });
            }
            sanitizedCustomSlug = customSlug;
        }

        // Security: Validate password strength if provided
        if (password) {
            if (password.length < 4) {
                return res.status(400).json({ message: 'Password must be at least 4 characters long' });
            }
            if (password.length > 100) {
                return res.status(400).json({ message: 'Password is too long' });
            }
        }

        // Security: Validate expiresInMinutes
        if (expiresInMinutes !== null && expiresInMinutes !== undefined) {
            if (expiresInMinutes < 1 || expiresInMinutes > 525600) { // Max 1 year
                return res.status(400).json({ message: 'Expiration time must be between 1 minute and 1 year' });
            }
        }

        let linkType = 'file';
        let ownerId: string | null = null;
        let linkData: any = {
            id: sanitizedCustomSlug || nanoid(10),
            password: null,
            expiresAt: null,
            creatorId: req.user.id,
            directDownload: directDownload || false,
            isEmbed: isEmbed || false,
            customSlug: sanitizedCustomSlug,
        };

        // Handle file link
        if (fileId) {
            const file = await prisma.file.findUnique({
                where: { id: fileId },
            });

            if (!file) {
                return res.status(404).json({ message: 'File not found' });
            }

            if (file.ownerId !== req.user.id && !req.user.isAdmin) {
                return res.status(401).json({ message: 'Not authorized' });
            }

            linkType = 'file';
            ownerId = file.ownerId;
            linkData.fileId = fileId;
        }
        // Handle folder link
        else if (folderId) {
            const folder = await prisma.folder.findUnique({
                where: { id: folderId },
            });

            if (!folder) {
                return res.status(404).json({ message: 'Folder not found' });
            }

            if (folder.ownerId !== req.user.id && !req.user.isAdmin) {
                return res.status(401).json({ message: 'Not authorized' });
            }

            linkType = 'folder';
            ownerId = folder.ownerId;
            linkData.folderId = folderId;
        }

        let hashedPassword = null;
        if (password) {
            hashedPassword = await hashPassword(password);
        }
        linkData.password = hashedPassword;

        let expiresAt = null;
        if (expiresInMinutes) {
            expiresAt = new Date(Date.now() + expiresInMinutes * 60000);
        }
        linkData.expiresAt = expiresAt;
        linkData.type = linkType;

        const link = await prisma.link.create({
            data: linkData,
            include: {
                file: {
                    select: {
                        originalName: true,
                        mimeType: true,
                        size: true,
                    }
                },
                folder: {
                    select: {
                        name: true,
                    }
                }
            }
        });

        // Log activity
        const resourceName = link.file?.originalName || link.folder?.name || 'Link';
        await createActivity(
            req.user.id,
            'link',
            'create',
            link.id,
            'link',
            resourceName
        );

        const l = link as any;
        const linkWithSerializedBigInt = {
            ...l,
            password: undefined,
            isPasswordProtected: !!l.password,
            file: l.file ? { ...l.file, size: l.file.size?.toString() } : null
        };

        res.json(linkWithSerializedBigInt);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   PUT /api/links/:id
// @desc    Update a link (password, expiry, directDownload)
// @access  Private
router.put('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const { password, expiresInMinutes, removePassword, directDownload, isEmbed, customSlug } = updateLinkSchema.parse(req.body);

        // Security: Validate link ID format
        const linkId = req.params.id as string;
        if (!linkId || linkId.length > 100) {
            return res.status(400).json({ message: 'Invalid link ID' });
        }

        const link = await prisma.link.findUnique({
            where: { id: linkId },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });

        // Security: Verify ownership
        if (link.creatorId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized to modify this link' });
        }

        // Security: Validate and sanitize customSlug if provided
        let sanitizedCustomSlug: string | null = link.customSlug;
        if (customSlug !== undefined) {
            if (customSlug === null) {
                sanitizedCustomSlug = null;
            } else {
                const slugRegex = /^[a-zA-Z0-9_-]{1,50}$/;
                if (!slugRegex.test(customSlug)) {
                    return res.status(400).json({ message: 'Custom slug contains invalid characters' });
                }
                // Check if slug already exists (excluding current link)
                const existingLink = await prisma.link.findFirst({
                    where: {
                        id: customSlug,
                        NOT: { id: linkId }
                    }
                });
                if (existingLink) {
                    return res.status(409).json({ message: 'This custom slug is already in use' });
                }
                sanitizedCustomSlug = customSlug;
            }
        }

        // Security: Validate password if provided
        if (password !== undefined && password !== null && !removePassword) {
            if (password.length < 4) {
                return res.status(400).json({ message: 'Password must be at least 4 characters long' });
            }
            if (password.length > 100) {
                return res.status(400).json({ message: 'Password is too long' });
            }
        }

        // Security: Validate expiresInMinutes
        if (expiresInMinutes !== null && expiresInMinutes !== undefined) {
            if (expiresInMinutes < 1 || expiresInMinutes > 525600) {
                return res.status(400).json({ message: 'Expiration time must be between 1 minute and 1 year' });
            }
        }

        const updateData: any = {
            customSlug: sanitizedCustomSlug,
        };

        if (removePassword) {
            updateData.password = null;
        } else if (password) {
            updateData.password = await hashPassword(password);
        }

        if (expiresInMinutes === null) {
            updateData.expiresAt = null; // Remove expiry
        } else if (expiresInMinutes) {
            updateData.expiresAt = new Date(Date.now() + expiresInMinutes * 60000);
        }

        if (directDownload !== undefined) {
            updateData.directDownload = directDownload;
        }

        if (isEmbed !== undefined) {
            updateData.isEmbed = isEmbed;
        }

        const updated = await prisma.link.update({
            where: { id: req.params.id as string },
            data: updateData,
            include: {
                file: { select: { originalName: true, mimeType: true, size: true } },
                folder: { select: { name: true } },
            },
        });

        const serialized = {
            ...updated,
            password: undefined,
            isPasswordProtected: !!updated.password,
            file: updated.file ? { ...updated.file, size: updated.file.size.toString() } : null
        };

        res.json(serialized);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   DELETE /api/links/:id
// @desc    Delete a link
// @access  Private
router.delete('/:id', protect, requirePermission('share_files'), async (req: AuthRequest, res, next) => {
    try {
        const link = await prisma.link.findUnique({
            where: { id: req.params.id as string },
            include: {
                file: { select: { originalName: true } },
                folder: { select: { name: true } }
            },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });
        if (link.creatorId !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await prisma.link.delete({ where: { id: req.params.id as string } });

        // Log activity
        const resourceName = link.file?.originalName || link.folder?.name || 'Link';
        await createActivity(
            req.user.id,
            'link',
            'delete',
            req.params.id as string,
            'link',
            resourceName
        );

        res.json({ message: 'Link deleted' });
    } catch (err) {
        next(err);
    }
});

// @route   OPTIONS /api/links/:id/raw
// @desc    Handle CORS preflight for raw endpoint
// @access  Public
router.options('/:id/raw', (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(204).end();
});

// @route   GET /api/links/:id/raw
// @desc    Get direct raw content (proxied for security AND throttling)
// @access  Public
// NOTE: This route handles BOTH regular and embed links
router.get('/:id/raw', async (req, res, next) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const linkId = req.params.id as string;

    // Set CORS headers FIRST, before any other operations
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');

    try {
        console.log(`[RAW] Request for linkId: ${linkId}`);
        const link = await prisma.link.findFirst({
            where: {
                OR: [
                    { id: linkId },
                    { customSlug: linkId }
                ]
            },
            include: { file: true },
        });

        console.log(`[RAW] Found link:`, link ? { id: link.id, isEmbed: link.isEmbed, fileId: link.fileId } : 'NOT FOUND');

        if (!link) {
            return res.redirect(`${frontendUrl}/s/${linkId}`);
        }

        if (link.expiresAt && link.expiresAt < new Date()) {
            return res.redirect(`${frontendUrl}/s/${linkId}`);
        }

        if (!link.file) {
            return res.redirect(`${frontendUrl}/s/${linkId}`);
        }

        // Check password if link is password protected (skip for embeds)
        if (link.password && !link.isEmbed) {
            const providedPassword = req.query.password as string;
            if (!providedPassword) {
                return res.redirect(`${frontendUrl}/s/${linkId}?require_password=true`);
            }
            const isValid = await verifyPassword(link.password, providedPassword);
            if (!isValid) {
                return res.redirect(`${frontendUrl}/s/${linkId}?require_password=true&error=invalid_password`);
            }
        }

        // Import MinIO client
        const { minioClient, BUCKET_NAME } = require('../utils/storage');

        const file = link.file as any;
        const safeFilename = encodeURIComponent(file.originalName);

        // Throttling limits (KB/s -> Bytes/s)
        const downloadSpeedKB = parseInt(process.env.MAX_DOWNLOAD_SPEED || '0');
        const downloadSpeedBytes = downloadSpeedKB * 1024;
        const shouldThrottle = downloadSpeedBytes > 0;

        // Check if file exists in MinIO first
        try {
            await minioClient.statObject(BUCKET_NAME, file.storedName);
        } catch (statErr: any) {
            console.error(`[RAW] File not found in MinIO for link ${linkId}:`, statErr);
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }

        // Handle Range requests for video/audio seeking (especially important for embeds)
        const range = req.headers.range;
        
        if (range && link.isEmbed) {
            // For embeds, handle Range requests for video/audio players
            try {
                const stat = await minioClient.statObject(BUCKET_NAME, file.storedName);
                const fileSize = stat.size;
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                const dataStream = await minioClient.getPartialObject(BUCKET_NAME, file.storedName, start, chunksize);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': file.mimeType,
                    'Content-Disposition': `inline; filename="${safeFilename}"`,
                });

                dataStream.on('error', (err: any) => {
                    console.error('[EMBED RAW] Stream Error', err);
                    res.end();
                });

                dataStream.pipe(res);
                return;
            } catch (minioErr) {
                console.error('[EMBED RAW] Range request error:', minioErr);
                // Fall through to regular streaming
            }
        }

        // Regular streaming (non-embed or fallback)
        let objectStream: any;
        try {
            objectStream = await minioClient.getObject(BUCKET_NAME, file.storedName);
        } catch (getErr: any) {
            console.error(`[RAW] Failed to get object stream for link ${linkId}:`, getErr);
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }

        // Set content headers before streaming
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Handle stream errors
        objectStream.on('error', (streamErr: any) => {
            console.error(`[RAW] Stream error for link ${linkId}:`, streamErr);
            if (!res.headersSent) {
                try {
                    res.status(500).json({ message: 'Error streaming file' });
                } catch (e) {}
            }
        });

        // Handle response errors
        res.on('error', (resErr: any) => {
            console.error(`[RAW] Response error for link ${linkId}:`, resErr);
        });

        // Handle client disconnect
        req.on('close', () => {
            if (objectStream && typeof objectStream.destroy === 'function') {
                objectStream.destroy();
            }
        });

        // Increment view count in background
        prisma.link.update({
            where: { id: link.id },
            data: { views: { increment: 1 } },
        }).catch(err => {
            console.error(`[RAW] Failed to increment view count for link ${linkId}:`, err);
        });

        // Stream the file
        if (shouldThrottle) {
            const throttledStream = new ThrottledStream(downloadSpeedBytes);
            throttledStream.on('error', (throttleErr: any) => {
                console.error(`[RAW] Throttle stream error for link ${linkId}:`, throttleErr);
                if (!res.headersSent) {
                    try {
                        res.status(500).json({ message: 'Error streaming file' });
                    } catch (e) {}
                }
            });
            objectStream.pipe(throttledStream).pipe(res);
        } else {
            objectStream.pipe(res);
        }
    } catch (err: any) {
        console.error(`[RAW] General error for link ${linkId}:`, err);
        if (!res.headersSent) {
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }
        if (!res.writableEnded) {
            res.end();
        }
    }
});

// @route   GET /api/links/:id
// @desc    Get link info (public) - supports files and folders
// @access  Public
router.get('/:id', async (req, res, next) => {
    try {
        // Try to find by id or customSlug
        const link = await prisma.link.findFirst({
            where: {
                OR: [
                    { id: req.params.id as string },
                    { customSlug: req.params.id as string }
                ]
            },
            include: {
                file: true,
                folder: true,
            },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });

        if (link.expiresAt && link.expiresAt < new Date()) {
            return res.status(410).json({ message: 'Link expired' });
        }

        res.json({
            id: link.id,
            type: link.type,
            isPasswordProtected: !!link.password,
            fileName: link.file?.originalName,
            mimeType: link.file?.mimeType,
            folderName: link.folder?.name,
            expiresAt: link.expiresAt,
            directDownload: link.directDownload,
            isEmbed: link.isEmbed,
        });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/links/:id/verify
// @desc    Verify password and get download URL
// @access  Public
router.post('/:id/verify', async (req, res, next) => {
    try {
        const { password } = req.body;
        const link = await prisma.link.findFirst({
            where: {
                OR: [
                    { id: req.params.id as string },
                    { customSlug: req.params.id as string }
                ]
            },
            include: {
                file: true,
                folder: true,
            },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });
        if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ message: 'Link expired' });

        if (link.password) {
            if (!password) return res.status(401).json({ message: 'Password required' });
            const isValid = await verifyPassword(link.password, password);
            if (!isValid) return res.status(401).json({ message: 'Invalid password' });
        }

        // Increment view count
        await prisma.link.update({
            where: { id: link.id },
            data: { views: { increment: 1 } },
        });

        // Handle file links
        if (link.file) {
            // Instead of exposing a direct MinIO URL (which can break if external
            // endpoints / buckets aren't perfectly configured), we proxy the download
            // through our own API. The frontend will call /api/links/:id/download.
            return res.json({
                type: 'file',
                fileId: link.file.id,
                linkId: link.id,
                downloadPath: `/api/links/${req.params.id}/download`,
            });
        }

        // Handle folder links (return folder info)
        if (link.folder) {
            return res.json({
                folder: {
                    id: link.folder.id,
                    name: link.folder.name,
                },
                type: 'folder'
            });
        }

        return res.status(404).json({ message: 'Resource not found' });

    } catch (err: any) {
        next(err);
    }
});

// @route   GET /api/links/:id/download
// @desc    Stream file download for public links (no MinIO URL exposed)
// @access  Public (secured by link id + optional password on /verify)
router.get('/:id/download', async (req, res, next) => {
    try {
        const link = await prisma.link.findFirst({
            where: {
                OR: [
                    { id: req.params.id as string },
                    { customSlug: req.params.id as string }
                ]
            },
            include: {
                file: true,
            },
        });

        if (!link || !link.file) {
            return res.status(404).json({ message: 'Link not found' });
        }
        if (link.expiresAt && link.expiresAt < new Date()) {
            return res.status(410).json({ message: 'Link expired' });
        }

        const file = link.file as any;
        const safeFilename = encodeURIComponent(file.originalName);

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
                console.error('[PUBLIC DOWNLOAD] Stream Error', err);
                res.end();
            });

            dataStream.pipe(res);
        } catch (minioErr) {
            next(minioErr);
        }
    } catch (err) {
        next(err);
    }
});

export default router;
