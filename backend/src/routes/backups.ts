import express from 'express';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import prisma from '../config/db';
import { BackupManager } from '../services/backup/BackupManager';
import { encryptCredential } from '../utils/encryption';

const router = express.Router();
const manager = new BackupManager();

// GET /api/backups
router.get('/', protect, requirePermission('manage_backups'), async (req: AuthRequest, res) => {
    try {
        const configs = await prisma.backupConfig.findMany({
            include: {
                backups: {
                    orderBy: { startedAt: 'desc' },
                    take: 10
                }
            }
        });
        
        // Scrub encrypted credentials entirely from response
        const safeConfigs = configs.map(c => ({
            ...c,
            s3AccessKey: c.s3AccessKey ? '***' : null,
            s3SecretKey: c.s3SecretKey ? '***' : null,
            sshPassword: c.sshPassword ? '***' : null,
            sshKey: c.sshKey ? '***' : null,
        }));
        
        res.json(safeConfigs);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// POST /api/backups (Upsert config)
router.post('/', protect, requirePermission('manage_backups'), async (req: AuthRequest, res) => {
    try {
        const { id, type, name, enabled, s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey, s3Region, sshHost, sshUser, sshPath, sshPassword, sshKey, localPath, schedule, retention } = req.body;
        
        const data: any = { type, name, enabled, schedule, retention };

        // Handle S3
        if (type === 's3') {
            data.s3Endpoint = s3Endpoint;
            data.s3Bucket = s3Bucket;
            data.s3Region = s3Region;
            if (s3AccessKey && s3AccessKey !== '***') data.s3AccessKey = encryptCredential(s3AccessKey);
            if (s3SecretKey && s3SecretKey !== '***') data.s3SecretKey = encryptCredential(s3SecretKey);
        }

        // Handle SSH
        if (type === 'ssh') {
            data.sshHost = sshHost;
            data.sshUser = sshUser;
            data.sshPath = sshPath;
            if (sshPassword && sshPassword !== '***') data.sshPassword = encryptCredential(sshPassword);
            if (sshKey && sshKey !== '***') data.sshKey = encryptCredential(sshKey);
        }

        // Handle Local
        if (type === 'local') {
            data.localPath = localPath;
        }

        let config;
        if (id) {
            config = await prisma.backupConfig.update({ where: { id }, data });
        } else {
            config = await prisma.backupConfig.create({ data });
        }

        res.json({ id: config.id, message: "Configuration saved successfully" });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// POST /api/backups/trigger
router.post('/trigger', protect, requirePermission('manage_backups'), async (req: AuthRequest, res) => {
    try {
        const { configId } = req.body;
        const config = await prisma.backupConfig.findUnique({ where: { id: configId } });
        if (!config) return res.status(404).json({ message: "Config not found" });

        const backupRecord = await prisma.backup.create({
            data: {
                configId: config.id,
                status: 'in_progress',
                initiatorId: req.user.id
            }
        });

        // Run async
        manager.executeBackup(config).then(async (result) => {
            await prisma.backup.update({
                where: { id: backupRecord.id },
                data: { status: 'success', log: result.log, size: result.size, filename: result.filename, completedAt: new Date() }
            });
        }).catch(async (err) => {
            await prisma.backup.update({
                where: { id: backupRecord.id },
                data: { status: 'failed', log: err.message || 'Unknown error', completedAt: new Date() }
            });
        });

        res.json({ message: "Backup started in background" });
    } catch(e: any) {
        res.status(500).json({ message: e.message });
    }
});

// POST /api/backups/:id/restore
router.post('/:id/restore', protect, requirePermission('manage_backups'), async (req: AuthRequest, res) => {
    try {
        const { confirm } = req.body;
        const backupRecord = await prisma.backup.findUnique({
            where: { id: req.params.id as string },
            include: { config: true }
        }) as any;

        if (!backupRecord || !backupRecord.filename) {
            return res.status(404).json({ message: "Backup file not found" });
        }

        if (!confirm) {
            // Dry run logic
            return res.json({
                message: "DRY-RUN: Restore would overwrite the current database",
                affected: "All PostgreSQL tables connected to DATABASE_URL",
                warnings: ["You will lose all data created after the backup timestamp.", "This action is extremely destructive in production."],
                requireConfirm: true
            });
        }

        // Actual restore
        const result = await manager.restoreBackup(backupRecord.config, backupRecord.filename as string);
        res.json({ message: "Restore executed successfully", details: result });
    } catch(e: any) {
        res.status(500).json({ message: e.message });
    }
});

export default router;
