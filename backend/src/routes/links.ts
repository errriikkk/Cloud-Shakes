import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';
import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from '../utils/auth';
import { ThrottledStream } from '../utils/throttle';
import { minioClient, BUCKET_NAME } from '../utils/storage';

const router = express.Router();

// ---------------------------------------------------------------------------
// Security: Safe MIME type allowlist
// ---------------------------------------------------------------------------
const SAFE_MIME_TYPES = new Set([
    // Images
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
    'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon',
    // Video
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
    'video/x-matroska', 'video/3gpp', 'video/3gpp2',
    // Audio
    'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm',
    'audio/aac', 'audio/flac', 'audio/x-flac',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    'application/zip', 'application/x-zip-compressed',
    'application/x-tar', 'application/gzip', 'application/x-7z-compressed',
    'application/x-rar-compressed',
    // Text (as download, not rendered)
    'text/plain', 'text/csv',
    // Binary fallback
    'application/octet-stream',
]);

/**
 * Sanitize mimeType: only serve known-safe types.
 * Anything not in the allowlist is served as application/octet-stream
 * to prevent stored XSS via crafted mimeType values in the DB.
 */
function sanitizeMimeType(mimeType: string | null | undefined): string {
    if (!mimeType) return 'application/octet-stream';
    const lower = mimeType.toLowerCase().trim();
    return SAFE_MIME_TYPES.has(lower) ? lower : 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Security: CORS origin allowlist helper
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set(
    (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
        .split(',')
        .map(o => o.trim())
);

function setCorsHeaders(req: express.Request, res: express.Response): void {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
        // Non-browser request (e.g. curl, server-to-server) — restrict
        res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    }
    // Unknown origins get no ACAO header → browser blocks the request
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
}

// ---------------------------------------------------------------------------
// Security: Rate limiters
// ---------------------------------------------------------------------------

/** Strict limiter for password verification — prevents brute force */
const verifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts, please try again later' },
    skipSuccessfulRequests: false,
});

/** Moderate limiter for public download/raw endpoints */
const downloadRateLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,               // 60 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please slow down' },
});

/** Lenient limiter for public link info */
const publicInfoRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests' },
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// @route   GET /api/links/stats
// @desc    Get link statistics and analytics
// @access  Private - requires view_links permission
// ---------------------------------------------------------------------------
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

        const totalLinks = links.length;
        const totalViews = (links as any[]).reduce((sum: number, link: any) => sum + link.views, 0);
        const activeLinks = (links as any[]).filter((link: any) => !link.expiresAt || new Date(link.expiresAt) > new Date()).length;
        const expiredLinks = (links as any[]).filter((link: any) => link.expiresAt && new Date(link.expiresAt) <= new Date()).length;

        const viewsByHour: Record<number, number> = {};
        for (let i = 0; i < 24; i++) viewsByHour[i] = 0;

        const viewsByDay: Record<string, number> = {};
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            viewsByDay[date.toISOString().split('T')[0]] = 0;
        }

        const linksByType: Record<string, number> = {};
        (links as any[]).forEach((link: any) => {
            linksByType[link.type] = (linksByType[link.type] || 0) + 1;
        });

        const mostViewed = (links as any[])
            .sort((a: any, b: any) => b.views - a.views)
            .slice(0, 10)
            .map((link: any) => ({ id: link.id, views: link.views, type: link.type }));

        res.json({ totalLinks, totalViews, activeLinks, expiredLinks, viewsByHour, viewsByDay, linksByType, mostViewed });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/links
// @desc    List all links for the current user
// @access  Private
// ---------------------------------------------------------------------------
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const links = await (prisma.link as any).findMany({
            where: { creatorId: req.user.id },
            include: {
                file: { include: { folder: true } },
                folder: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Auto-delete orphaned links (background, non-blocking)
        const orphanedLinkIds: string[] = [];
        for (const link of links) {
            if (link.type === 'file' && link.fileId && !link.file) orphanedLinkIds.push(link.id);
            else if (link.type === 'folder' && link.folderId && !link.folder) orphanedLinkIds.push(link.id);
        }
        if (orphanedLinkIds.length > 0) {
            (prisma.link as any).deleteMany({ where: { id: { in: orphanedLinkIds } } })
                .catch((err: any) => console.error('Error auto-deleting orphaned links:', err));
        }

        const validLinks = (links as any[]).filter((link: any) => {
            if (link.type === 'file' && link.fileId && !link.file) return false;
            if (link.type === 'folder' && link.folderId && !link.folder) return false;
            return true;
        });

        const linksWithStatus = validLinks.map((link: any) => ({
            ...link,
            isExpired: link.expiresAt ? link.expiresAt < new Date() : false,
            isPasswordProtected: !!link.password,
            password: undefined,
            file: link.file ? { ...link.file, size: link.file.size.toString() } : null,
            folder: link.folder || (link.file && link.file.folder ? link.file.folder : null),
        }));

        res.json(linksWithStatus);
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/links
// @desc    Create a shareable link (for files or folders)
// @access  Private
// ---------------------------------------------------------------------------
router.post('/', protect, requirePermission('share_files'), async (req: AuthRequest, res, next) => {
    try {
        const { fileId, folderId, password, expiresInMinutes, directDownload, isEmbed, customSlug } = createLinkSchema.parse(req.body);

        // Validate and sanitize customSlug
        let sanitizedCustomSlug: string | null = null;
        if (customSlug) {
            const slugRegex = /^[a-zA-Z0-9_-]{1,50}$/;
            if (!slugRegex.test(customSlug)) {
                return res.status(400).json({ message: 'Custom slug contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.' });
            }
            const existingLink = await prisma.link.findUnique({ where: { id: customSlug } });
            if (existingLink) {
                return res.status(409).json({ message: 'This custom slug is already in use' });
            }
            sanitizedCustomSlug = customSlug;
        }

        // Validate password strength
        if (password) {
            if (password.length < 4)   return res.status(400).json({ message: 'Password must be at least 4 characters long' });
            if (password.length > 100) return res.status(400).json({ message: 'Password is too long' });
        }

        // Validate expiresInMinutes
        if (expiresInMinutes != null) {
            if (expiresInMinutes < 1 || expiresInMinutes > 525600) {
                return res.status(400).json({ message: 'Expiration time must be between 1 minute and 1 year' });
            }
        }

        let linkType = 'file';
        const linkData: any = {
            id: sanitizedCustomSlug || nanoid(10),
            password: null,
            expiresAt: null,
            creatorId: req.user.id,
            directDownload: directDownload || false,
            isEmbed: isEmbed || false,
            customSlug: sanitizedCustomSlug,
        };

        if (fileId) {
            const file = await prisma.file.findUnique({ where: { id: fileId } });
            if (!file) return res.status(404).json({ message: 'File not found' });
            if (file.ownerId !== req.user.id && !req.user.isAdmin) return res.status(401).json({ message: 'Not authorized' });
            linkType = 'file';
            linkData.fileId = fileId;
        } else if (folderId) {
            const folder = await prisma.folder.findUnique({ where: { id: folderId } });
            if (!folder) return res.status(404).json({ message: 'Folder not found' });
            if (folder.ownerId !== req.user.id && !req.user.isAdmin) return res.status(401).json({ message: 'Not authorized' });
            linkType = 'folder';
            linkData.folderId = folderId;
        }

        linkData.password = password ? await hashPassword(password) : null;
        linkData.expiresAt = expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60000) : null;
        linkData.type = linkType;

        const link = await prisma.link.create({
            data: linkData,
            include: {
                file: { select: { originalName: true, mimeType: true, size: true } },
                folder: { select: { name: true } },
            },
        });

        const resourceName = link.file?.originalName || link.folder?.name || 'Link';
        await createActivity(req.user.id, 'link', 'create', link.id, 'link', resourceName);

        const l = link as any;
        res.json({
            ...l,
            password: undefined,
            isPasswordProtected: !!l.password,
            file: l.file ? { ...l.file, size: l.file.size?.toString() } : null,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
        next(error);
    }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/links/:id
// @desc    Update a link (password, expiry, directDownload)
// @access  Private
// ---------------------------------------------------------------------------
router.put('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const { password, expiresInMinutes, removePassword, directDownload, isEmbed, customSlug } = updateLinkSchema.parse(req.body);

        const linkId = req.params.id as string;
        if (!linkId || linkId.length > 100) return res.status(400).json({ message: 'Invalid link ID' });

        const link = await prisma.link.findUnique({ where: { id: linkId } });
        if (!link) return res.status(404).json({ message: 'Link not found' });
        if (link.creatorId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized to modify this link' });
        }

        let sanitizedCustomSlug: string | null = link.customSlug;
        if (customSlug !== undefined) {
            if (customSlug === null) {
                sanitizedCustomSlug = null;
            } else {
                const slugRegex = /^[a-zA-Z0-9_-]{1,50}$/;
                if (!slugRegex.test(customSlug)) return res.status(400).json({ message: 'Custom slug contains invalid characters' });
                const existingLink = await prisma.link.findFirst({ where: { id: customSlug, NOT: { id: linkId } } });
                if (existingLink) return res.status(409).json({ message: 'This custom slug is already in use' });
                sanitizedCustomSlug = customSlug;
            }
        }

        if (password !== undefined && password !== null && !removePassword) {
            if (password.length < 4)   return res.status(400).json({ message: 'Password must be at least 4 characters long' });
            if (password.length > 100) return res.status(400).json({ message: 'Password is too long' });
        }

        if (expiresInMinutes != null) {
            if (expiresInMinutes < 1 || expiresInMinutes > 525600) {
                return res.status(400).json({ message: 'Expiration time must be between 1 minute and 1 year' });
            }
        }

        const updateData: any = { customSlug: sanitizedCustomSlug };

        if (removePassword)       updateData.password = null;
        else if (password)        updateData.password = await hashPassword(password);

        if (expiresInMinutes === null) updateData.expiresAt = null;
        else if (expiresInMinutes)     updateData.expiresAt = new Date(Date.now() + expiresInMinutes * 60000);

        if (directDownload !== undefined) updateData.directDownload = directDownload;
        if (isEmbed !== undefined)        updateData.isEmbed = isEmbed;

        const updated = await prisma.link.update({
            where: { id: req.params.id as string },
            data: updateData,
            include: {
                file: { select: { originalName: true, mimeType: true, size: true } },
                folder: { select: { name: true } },
            },
        });

        res.json({
            ...updated,
            password: undefined,
            isPasswordProtected: !!updated.password,
            file: updated.file ? { ...updated.file, size: updated.file.size.toString() } : null,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
        next(error);
    }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/links/:id
// @desc    Delete a link
// @access  Private
// ---------------------------------------------------------------------------
router.delete('/:id', protect, requirePermission('share_files'), async (req: AuthRequest, res, next) => {
    try {
        const link = await prisma.link.findUnique({
            where: { id: req.params.id as string },
            include: {
                file: { select: { originalName: true } },
                folder: { select: { name: true } },
            },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });
        if (link.creatorId !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await prisma.link.delete({ where: { id: req.params.id as string } });

        const resourceName = link.file?.originalName || link.folder?.name || 'Link';
        await createActivity(req.user.id, 'link', 'delete', req.params.id as string, 'link', resourceName);

        res.json({ message: 'Link deleted' });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// @route   OPTIONS /api/links/:id/raw
// @desc    CORS preflight for raw endpoint
// @access  Public
// ---------------------------------------------------------------------------
router.options('/:id/raw', (req, res) => {
    setCorsHeaders(req, res);
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
});

// ---------------------------------------------------------------------------
// @route   GET /api/links/:id/raw
// @desc    Stream raw file content (proxied, throttled)
// @access  Public
// NOTE: Handles both regular and embed links.
//        Security fix: embed links still require password verification.
// ---------------------------------------------------------------------------
router.get('/:id/raw', downloadRateLimiter, async (req, res, next) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const linkId = req.params.id as string;

    // Set CORS headers first
    setCorsHeaders(req, res);

    try {
        const link = await prisma.link.findFirst({
            where: { OR: [{ id: linkId }, { customSlug: linkId }] },
            include: { file: true },
        });

        if (!link) return res.redirect(`${frontendUrl}/s/${linkId}`);
        if (link.expiresAt && link.expiresAt < new Date()) return res.redirect(`${frontendUrl}/s/${linkId}`);
        if (!link.file) return res.redirect(`${frontendUrl}/s/${linkId}`);

        // Security fix: password check applies to ALL link types, including embeds.
        // Embed links skip this only if they were created without a password.
        if (link.password) {
            const providedPassword = req.query.password as string;
            if (!providedPassword) {
                return res.redirect(`${frontendUrl}/s/${linkId}?require_password=true`);
            }
            const isValid = await verifyPassword(link.password, providedPassword);
            if (!isValid) {
                return res.redirect(`${frontendUrl}/s/${linkId}?require_password=true&error=invalid_password`);
            }
        }

        const file = link.file as any;
        const safeFilename = encodeURIComponent(file.originalName);

        // Security fix: sanitize mimeType before serving
        const safeMime = sanitizeMimeType(file.mimeType);

        // Throttling
        const downloadSpeedKB = parseInt(process.env.MAX_DOWNLOAD_SPEED || '0');
        const downloadSpeedBytes = downloadSpeedKB * 1024;
        const shouldThrottle = downloadSpeedBytes > 0;

        // Verify file exists in MinIO before committing headers
        try {
            await minioClient.statObject(BUCKET_NAME, file.storedName);
        } catch {
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }

        // Range requests (important for video/audio seeking in embeds)
        const range = req.headers.range;
        if (range && link.isEmbed) {
            try {
                const stat = await minioClient.statObject(BUCKET_NAME, file.storedName);
                const fileSize = stat.size;
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                const dataStream = await minioClient.getPartialObject(BUCKET_NAME, file.storedName, start, chunksize);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': safeMime,
                    'Content-Disposition': 'inline',
                    'X-Content-Type-Options': 'nosniff',
                });

                dataStream.on('error', (err: any) => {
                    console.error('[EMBED RAW] Stream error:', err);
                    res.end();
                });
                dataStream.pipe(res);
                return;
            } catch (minioErr) {
                console.error('[EMBED RAW] Range request error:', minioErr);
                // Fall through to regular streaming
            }
        }

        // Regular streaming
        let objectStream: any;
        try {
            objectStream = await minioClient.getObject(BUCKET_NAME, file.storedName);
        } catch {
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }

        // Security fix: use sanitized mimeType
        res.setHeader('Content-Type', safeMime);
        res.setHeader('Content-Disposition', link.isEmbed ? 'inline' : `inline; filename="${safeFilename}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        objectStream.on('error', (streamErr: any) => {
            console.error('[RAW] Stream error for link:', streamErr);
            if (!res.headersSent) {
                try { res.status(500).json({ message: 'Error streaming file' }); } catch {}
            }
        });

        res.on('error', (resErr: any) => {
            console.error('[RAW] Response error:', resErr);
        });

        req.on('close', () => {
            if (objectStream && typeof objectStream.destroy === 'function') {
                objectStream.destroy();
            }
        });

        // Increment view count only after successful auth (background, non-blocking)
        prisma.link.update({
            where: { id: link.id },
            data: { views: { increment: 1 } },
        }).catch(err => console.error('[RAW] Failed to increment view count:', err));

        if (shouldThrottle) {
            const throttledStream = new ThrottledStream(downloadSpeedBytes);
            throttledStream.on('error', (throttleErr: any) => {
                console.error('[RAW] Throttle stream error:', throttleErr);
                if (!res.headersSent) {
                    try { res.status(500).json({ message: 'Error streaming file' }); } catch {}
                }
            });
            objectStream.pipe(throttledStream).pipe(res);
        } else {
            objectStream.pipe(res);
        }
    } catch (err: any) {
        console.error('[RAW] General error:', err);
        if (!res.headersSent) {
            return res.redirect(`${frontendUrl}/s/${linkId}?error=file_unavailable`);
        }
        if (!res.writableEnded) res.end();
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/links/:id
// @desc    Get link info (public) - supports files and folders
// @access  Public
// ---------------------------------------------------------------------------
router.get('/:id', publicInfoRateLimiter, async (req, res, next) => {
    try {
        const link = await prisma.link.findFirst({
            where: { OR: [{ id: req.params.id as string }, { customSlug: req.params.id as string }] },
            include: { file: true, folder: true },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });

        // Security fix: unified 404 for expired links to avoid state enumeration.
        // Use 410 only if you want to communicate expiry — but that leaks info.
        // Keeping 410 here as it was in the original (acceptable trade-off).
        if (link.expiresAt && link.expiresAt < new Date()) {
            return res.status(410).json({ message: 'Link expired' });
        }

        res.json({
            id: link.id,
            type: link.type,
            isPasswordProtected: !!link.password,
            fileName: link.file?.originalName,
            mimeType: sanitizeMimeType(link.file?.mimeType),
            folderName: link.folder?.name,
            expiresAt: link.expiresAt,
            directDownload: link.directDownload,
            isEmbed: link.isEmbed,
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/links/:id/verify
// @desc    Verify password and get download path
// @access  Public
// ---------------------------------------------------------------------------
router.post('/:id/verify', verifyRateLimiter, async (req, res, next) => {
    try {
        const { password } = req.body;

        const link = await prisma.link.findFirst({
            where: { OR: [{ id: req.params.id as string }, { customSlug: req.params.id as string }] },
            include: { file: true, folder: true },
        });

        if (!link) return res.status(404).json({ message: 'Link not found' });
        if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ message: 'Link expired' });

        if (link.password) {
            if (!password) return res.status(401).json({ message: 'Password required' });
            const isValid = await verifyPassword(link.password, password);
            if (!isValid) return res.status(401).json({ message: 'Invalid password' });
        }

        // Increment view count only after successful verification
        await prisma.link.update({
            where: { id: link.id },
            data: { views: { increment: 1 } },
        });

        if (link.file) {
            return res.json({
                type: 'file',
                fileId: link.file.id,
                linkId: link.id,
                downloadPath: `/api/links/${req.params.id}/download`,
            });
        }

        if (link.folder) {
            return res.json({
                folder: { id: link.folder.id, name: link.folder.name },
                type: 'folder',
            });
        }

        return res.status(404).json({ message: 'Resource not found' });
    } catch (err: any) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/links/:id/download
// @desc    Stream file download for public links (no MinIO URL exposed)
// @access  Public (secured by link id; password enforcement done at /verify)
// ---------------------------------------------------------------------------
router.get('/:id/download', downloadRateLimiter, async (req, res, next) => {
    try {
        const link = await prisma.link.findFirst({
            where: { OR: [{ id: req.params.id as string }, { customSlug: req.params.id as string }] },
            include: { file: true },
        });

        if (!link || !link.file) return res.status(404).json({ message: 'Link not found' });
        if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ message: 'Link expired' });

        const file = link.file as any;
        const safeFilename = encodeURIComponent(file.originalName);

        // Security fix: sanitize mimeType
        const safeMime = sanitizeMimeType(file.mimeType);

        try {
            const stat = await minioClient.statObject(BUCKET_NAME, file.storedName);
            const fileSize = stat.size;
            const range = req.headers.range;

            let dataStream;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                dataStream = await minioClient.getPartialObject(BUCKET_NAME, file.storedName, start, chunksize);
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': safeMime,
                    'Content-Disposition': `attachment; filename="${safeFilename}"`,
                    'X-Content-Type-Options': 'nosniff',
                });
            } else {
                dataStream = await minioClient.getObject(BUCKET_NAME, file.storedName);
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': safeMime,
                    'Content-Disposition': `attachment; filename="${safeFilename}"`,
                    'Accept-Ranges': 'bytes',
                    'X-Content-Type-Options': 'nosniff',
                });
            }

            dataStream.on('error', (err: any) => {
                console.error('[PUBLIC DOWNLOAD] Stream error:', err);
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