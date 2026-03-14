import express from 'express';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { minioClient, BUCKET_NAME } from '../utils/storage';
import { createActivity } from './activity';

const router = express.Router();

// @route   POST /api/folders
// @desc    Create a new folder
// @access  Private
router.post('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const { name, parentId } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Folder name is required' });
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                ownerId: req.user.id,
                parentId: parentId || null,
            },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'folder',
            'create',
            folder.id,
            'folder',
            name
        );

        res.status(201).json(folder);
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/folders
// @desc    List folders (root or by parentId)
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const parentId = (req.query.parentId as string) || null;

        // Check if user has workspace permission to see all folders
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        const folders = await prisma.folder.findMany({
            where: canViewAll 
                ? { parentId: parentId === 'null' ? null : parentId }
                : { ownerId: req.user.id, parentId: parentId === 'null' ? null : parentId },
            orderBy: { createdAt: 'desc' },
        });

        res.json(folders);
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/all-content
// @desc    Get all folders and files for the user in one call
// @access  Private
router.get('/all-content', protect, async (req: AuthRequest, res, next) => {
    try {
        // Check if user has workspace permission to see all folders
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        const folders = await prisma.folder.findMany({
            where: canViewAll ? {} : { ownerId: req.user.id },
        });

        const files = await prisma.file.findMany({
            where: canViewAll ? {} : { ownerId: req.user.id },
        });

        res.json({
            folders,
            files: (files as any[]).map(f => ({
                ...f,
                size: f.size?.toString() ?? '0'
            })),
        });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/folders/:id
// @desc    Get folder details and parent trail
// @access  Private
router.get('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const id = req.params.id as string;

        const folder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        // Check if user has workspace permission
        const userRoles = await prisma.userRole.findMany({
            where: { userId: req.user.id },
            include: { role: { include: { permissions: true } } }
        });
        const permissions = new Set(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.name))
        );
        const canViewAll = req.user.isAdmin || permissions.has('view_workspace_files');

        if (folder.ownerId !== req.user.id && !canViewAll) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Recursively build breadcrumb trail
        const trail: { id: string | null, name: string }[] = [];
        let currentFolder: any = folder;

        while (currentFolder && trail.length < 50) {
            trail.unshift({ id: currentFolder.id, name: currentFolder.name });
            if (currentFolder.parentId && currentFolder.parentId !== currentFolder.id) {
                currentFolder = await prisma.folder.findUnique({
                    where: { id: currentFolder.parentId as string }
                });
            } else {
                currentFolder = null;
            }
        }

        // Add root
        trail.unshift({ id: null, name: "Mis Archivos" });

        res.json({ ...folder, trail });
    } catch (err) {
        next(err);
    }
});

// @route   DELETE /api/folders/:id
// @desc    Delete a folder
// @access  Private
router.delete('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const id = req.params.id as string;
        const folder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        if (folder.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Helper function to recursively find all files in a folder and its subfolders
        const getAllFilesInFolder = async (folderId: string): Promise<any[]> => {
            const files = await prisma.file.findMany({ where: { folderId } });
            const subfolders = await prisma.folder.findMany({ where: { parentId: folderId } });

            let allFiles = [...files];
            for (const subfolder of subfolders) {
                const subfolderFiles = await getAllFilesInFolder(subfolder.id);
                allFiles = [...allFiles, ...subfolderFiles];
            }
            return allFiles;
        };

        // 1. Get ALL files that will be deleted due to cascade (or manual recursion)
        const filesToDelete = await getAllFilesInFolder(id);

        // 2. Remove all those files from MinIO
        for (const file of filesToDelete) {
            try {
                await minioClient.removeObject(BUCKET_NAME, file.storedName);
                console.log(`[CLEANUP] Removed ${file.storedName} from MinIO`);
            } catch (err) {
                console.error(`[CLEANUP] Failed to remove ${file.storedName} from MinIO:`, err);
            }
        }

        // 3. Delete the folder (Prisma will handle cascading deletes for database records)
        await prisma.folder.delete({
            where: { id },
        });

        // Log activity
        await createActivity(
            req.user.id,
            'folder',
            'delete',
            id,
            'folder',
            folder.name
        );

        res.json({ message: 'Folder and its contents removed' });
    } catch (err) {
        next(err);
    }
});

// @route   PATCH /api/folders/:id/move
// @desc    Move a folder
// @access  Private
router.patch('/:id/move', protect, async (req: AuthRequest, res, next) => {
    try {
        const id = req.params.id as string;
        const { targetFolderId } = req.body; // null means root

        const folder = await prisma.folder.findUnique({
            where: { id },
        });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        if (folder.ownerId !== req.user.id && !req.user.isAdmin) {
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

            // Prevent circular dependency (moving into self or a child)
            if (id === targetFolderId) {
                return res.status(400).json({ message: 'Cannot move folder into itself' });
            }

            // Recursive check for descendant
            let currentParent = targetFolder.parentId;
            while (currentParent) {
                if (currentParent === id) {
                    return res.status(400).json({ message: 'Cannot move folder into its own descendant' });
                }
                const parent = await prisma.folder.findUnique({ where: { id: currentParent as string } });
                currentParent = parent?.parentId || null;
            }
        }

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: { parentId: targetFolderId || null },
        });

        res.json(updatedFolder);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/folders/bulk-delete
// @desc    Delete multiple folders
// @access  Private
router.post('/bulk-delete', protect, async (req: AuthRequest, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No folder IDs provided' });
        }

        const folders = await prisma.folder.findMany({
            where: {
                id: { in: ids },
                ownerId: req.user.id
            }
        });

        const getAllFilesInFolder = async (folderId: string): Promise<any[]> => {
            const files = await prisma.file.findMany({ where: { folderId } });
            const subfolders = await prisma.folder.findMany({ where: { parentId: folderId } });
            let allFiles = [...files];
            for (const subfolder of subfolders) {
                const subfolderFiles = await getAllFilesInFolder(subfolder.id);
                allFiles = [...allFiles, ...subfolderFiles];
            }
            return allFiles;
        };

        for (const folder of folders) {
            const filesToDelete = await getAllFilesInFolder(folder.id);
            for (const file of filesToDelete) {
                try {
                    await minioClient.removeObject(BUCKET_NAME, file.storedName);
                } catch (err) {
                    console.error(`Failed cleanup for ${file.storedName}:`, err);
                }
            }
            await prisma.folder.delete({ where: { id: folder.id } });
        }

        res.json({ message: `${folders.length} folders removed` });
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/folders/bulk-move
// @desc    Move multiple folders
// @access  Private
router.post('/bulk-move', protect, async (req: AuthRequest, res, next) => {
    try {
        const { ids, targetFolderId } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No folder IDs provided' });
        }

        if (targetFolderId) {
            const targetFolder = await prisma.folder.findUnique({ where: { id: targetFolderId } });
            if (!targetFolder || (targetFolder.ownerId !== req.user.id && !req.user.isAdmin)) {
                return res.status(404).json({ message: 'Target folder not found' });
            }
            if (ids.includes(targetFolderId)) {
                return res.status(400).json({ message: 'Cannot move folder into itself' });
            }
        }

        await prisma.folder.updateMany({
            where: {
                id: { in: ids },
                ownerId: req.user.id
            },
            data: { parentId: targetFolderId || null }
        });

        res.json({ message: `${ids.length} folders moved` });
    } catch (err) {
        next(err);
    }
});

export default router;
