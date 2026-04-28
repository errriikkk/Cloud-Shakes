import express from 'express';
import busboy from 'busboy';
import prisma from '../config/db';
import { minioClient, BUCKET_NAME } from '../utils/storage';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { safeUuid } from '../utils/id';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

// @route   GET /api/sync/state
// @desc    Get full directory and file tree for the user
// @access  Private
router.get('/state', protect, async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user.id;

        // Fetch folders (own)
        const folders = await prisma.folder.findMany({
            where: { ownerId: userId },
            select: {
                id: true,
                name: true,
                parentId: true,
                createdAt: true,
            }
        });

        // Fetch files (own)
        const files = await prisma.file.findMany({
            where: { ownerId: userId },
            select: {
                id: true,
                originalName: true,
                folderId: true,
                size: true,
                mimeType: true,
                createdAt: true,
            }
        });

        // Convert bigints to strings
        const serializedFiles = files.map(f => ({
            ...f,
            size: f.size.toString(),
            // ETag based on created time to help client detect changes
            etag: `"${f.id}-${f.createdAt.getTime()}"`
        }));

        res.json({
            status: 'success',
            data: {
                folders,
                files: serializedFiles,
                timestamp: Date.now()
            }
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/sync/download/:fileId
// @desc    Download file content (optimized for sync engine)
// @access  Private
router.get('/download/:fileId', protect, async (req: AuthRequest, res, next) => {
    try {
        const fileId = req.params.fileId as string;
        const file = await prisma.file.findUnique({ where: { id: fileId } });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        if (file.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const stat = await minioClient.statObject(BUCKET_NAME, file.storedName);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = String(range).replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            const dataStream = await minioClient.getPartialObject(BUCKET_NAME, file.storedName, start, chunksize);
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'application/octet-stream',
            });
            dataStream.pipe(res);
        } else {
            const dataStream = await minioClient.getObject(BUCKET_NAME, file.storedName);
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'application/octet-stream',
                'Accept-Ranges': 'bytes',
            });
            dataStream.pipe(res);
        }
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/sync/upload
// @desc    Upload file from sync client
// @access  Private
router.post('/upload', protect, async (req: AuthRequest, res, next) => {
    const bb = busboy({ headers: req.headers });
    let fileUploaded = false;
    let folderId: string | null = null;
    let originalName: string = 'unnamed_sync_file';
    let fileId: string | null = null;

    bb.on('field', (name: string, val: string) => {
        if (name === 'folderId' && val && val !== 'null') folderId = val;
        if (name === 'originalName' && val) originalName = val;
        if (name === 'fileId' && val) fileId = val; // For updating existing
    });

    bb.on('file', async (name: string, file: any, info: any) => {
        fileUploaded = true;
        
        try {
            const storedName = `${safeUuid()}-${originalName}`;
            const tempDir = '/tmp/shakes-sync-uploads';
            await fs.promises.mkdir(tempDir, { recursive: true });
            const tempPath = path.join(tempDir, storedName);

            const writeStream = fs.createWriteStream(tempPath);
            file.pipe(writeStream);

            await new Promise<void>((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            // Read and upload to MinIO
            const fileBuffer = await fs.promises.readFile(tempPath);
            await minioClient.putObject(BUCKET_NAME, storedName, fileBuffer, undefined as any, {
                'Content-Type': 'application/octet-stream',
            });
            
            await fs.promises.unlink(tempPath);
            const stat = await minioClient.statObject(BUCKET_NAME, storedName);

            let resultFile;
            if (fileId) {
                // Update existing file (create new version logic could go here)
                const existing = await prisma.file.findUnique({ where: { id: fileId } });
                if (existing && (existing.ownerId === req.user.id || req.user.isAdmin)) {
                    // Remove old from minio
                    await minioClient.removeObject(BUCKET_NAME, existing.storedName).catch(() => {});
                    
                    resultFile = await prisma.file.update({
                        where: { id: fileId },
                        data: {
                            storedName,
                            size: BigInt(stat.size)
                        }
                    });
                }
            } 

            if (!resultFile) {
                // Create new
                resultFile = await prisma.file.create({
                    data: {
                        originalName,
                        storedName,
                        mimeType: 'application/octet-stream',
                        size: BigInt(stat.size),
                        ownerId: req.user.id,
                        folderId: folderId,
                    }
                });
            }

            res.json({
                ...resultFile,
                size: resultFile.size.toString(),
                etag: `"${resultFile.id}-${resultFile.createdAt.getTime()}"`
            });
        } catch (err) {
            next(err);
        }
    });

    bb.on('close', () => {
        if (!fileUploaded && !res.headersSent) {
            res.status(400).json({ message: 'No file uploaded' });
        }
    });

    req.pipe(bb);
});

export default router;
