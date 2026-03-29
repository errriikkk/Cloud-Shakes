import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { minioClient, BUCKET_NAME, QUARANTINE_BUCKET_NAME } from '../utils/storage';
import prisma from '../config/db';

const execAsync = promisify(exec);

const CLAMAV_BASEDIR = process.env.CLAMAV_BASEDIR || '/tmp/clamav';
const CLAMAV_DATABASE_PATH = process.env.CLAMAV_DATABASE_PATH || '/var/lib/clamav';

export interface ScanResult {
    clean: boolean;
    virusName?: string;
    error?: string;
}

export async function ensureQuarantineBucket(): Promise<void> {
    try {
        const exists = await minioClient.bucketExists(QUARANTINE_BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(QUARANTINE_BUCKET_NAME, 'us-east-1');
            console.log('[Antivirus] Quarantine bucket created');
        }
    } catch (err) {
        console.error('[Antivirus] Failed to create quarantine bucket:', err);
    }
}

export async function updateClamavDatabase(): Promise<boolean> {
    try {
        console.log('[Antivirus] Updating ClamAV database...');
        await execAsync('freshclam --quiet');
        console.log('[Antivirus] ClamAV database updated');
        return true;
    } catch (err) {
        console.error('[Antivirus] Failed to update database:', err);
        return false;
    }
}

export async function scanFile(storedName: string): Promise<ScanResult> {
    const tempDir = path.join(CLAMAV_BASEDIR, 'scans');
    const tempFile = path.join(tempDir, `${Date.now()}-${storedName}`);

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });

        console.log(`[Antivirus] Downloading file from MinIO: ${storedName}`);
        await minioClient.fGetObject(BUCKET_NAME, storedName, tempFile);

        console.log(`[Antivirus] Scanning file: ${tempFile}`);
        const { stdout, stderr } = await execAsync(
            `clamscan --no-summary --infected "${tempFile}"`,
            { timeout: 300000 }
        );

        if (stdout.includes('Infected') || stdout.includes('FOUND')) {
            const virusMatch = stdout.match(/FOUND.*$/m) || stdout.match(/Infected.*$/m);
            const virusName = virusMatch ? virusMatch[0].trim() : 'Unknown virus';
            console.log(`[Antivirus] INFECTED: ${virusName}`);
            return { clean: false, virusName };
        }

        console.log('[Antivirus] File is clean');
        return { clean: true };
    } catch (err: any) {
        // ClamAV returns exit code 1 when virus is found
        if (err.code === 1 && (err.stdout?.includes('FOUND') || err.stdout?.includes('Infected'))) {
            const virusMatch = err.stdout?.match(/FOUND.*$/m) || err.stdout?.match(/Infected.*$/m);
            const virusName = virusMatch ? virusMatch[0].trim() : 'Unknown virus';
            console.log(`[Antivirus] INFECTED: ${virusName}`);
            return { clean: false, virusName };
        }
        console.error('[Antivirus] Scan error:', err);
        return { clean: false, error: err.message };
    } finally {
        try {
            if (fs.existsSync(tempFile)) {
                await fs.promises.unlink(tempFile);
            }
        } catch (e) {
            console.error('[Antivirus] Failed to delete temp file:', e);
        }
    }
}

export async function moveToQuarantine(storedName: string): Promise<boolean> {
    try {
        await ensureQuarantineBucket();
        const quarantinePath = `quarantine/${Date.now()}-${storedName}`;
        await minioClient.copyObject(
            QUARANTINE_BUCKET_NAME,
            quarantinePath,
            `${BUCKET_NAME}/${storedName}`
        );
        await minioClient.removeObject(BUCKET_NAME, storedName);
        console.log(`[Antivirus] File moved to quarantine: ${quarantinePath}`);
        return true;
    } catch (err) {
        console.error('[Antivirus] Failed to move to quarantine:', err);
        return false;
    }
}

export async function processPendingScans(): Promise<void> {
    try {
        const cloudSettings = await prisma.cloudSettings.findUnique({
            where: { id: 'default' }
        });

        if (!cloudSettings?.antivirusEnabled) {
            console.log('[Antivirus] Antivirus disabled, skipping scan');
            return;
        }

        const pendingFiles = await prisma.fileScan.findMany({
            where: { status: 'pending' },
            include: { file: true },
            take: 10
        });

        console.log(`[Antivirus] Processing ${pendingFiles.length} pending files`);

        for (const scan of pendingFiles) {
            try {
                await prisma.fileScan.update({
                    where: { id: scan.id },
                    data: { status: 'scanning' }
                });

                const result = await scanFile(scan.file.storedName);

                if (result.clean) {
                    await prisma.fileScan.update({
                        where: { id: scan.id },
                        data: {
                            status: 'clean',
                            result: null,
                            scannedAt: new Date()
                        }
                    });
                    console.log(`[Antivirus] File ${scan.fileId} is clean`);
                } else if (result.error) {
                    await prisma.fileScan.update({
                        where: { id: scan.id },
                        data: {
                            status: 'error',
                            result: result.error,
                            scannedAt: new Date()
                        }
                    });
                } else {
                    await prisma.fileScan.update({
                        where: { id: scan.id },
                        data: {
                            status: 'infected',
                            result: result.virusName,
                            scannedAt: new Date()
                        }
                    });

                    await moveToQuarantine(scan.file.storedName);
                    await prisma.file.update({
                        where: { id: scan.fileId },
                        data: { storedName: `DELETED-${scan.fileId}` }
                    });

                    console.log(`[Antivirus] INFECTED FILE DELETED: ${scan.fileId} - ${result.virusName}`);
                }
            } catch (err) {
                console.error(`[Antivirus] Error processing scan ${scan.id}:`, err);
                await prisma.fileScan.update({
                    where: { id: scan.id },
                    data: { status: 'error', result: (err as Error).message }
                });
            }
        }
    } catch (err) {
        console.error('[Antivirus] Error in processPendingScans:', err);
    }
}

export async function queueFileForScan(fileId: string): Promise<void> {
    const existingScan = await prisma.fileScan.findUnique({
        where: { fileId }
    });

    if (!existingScan) {
        await prisma.fileScan.create({
            data: {
                fileId,
                status: 'pending'
            }
        });
        console.log(`[Antivirus] File ${fileId} queued for scan`);
    }
}

if (require.main === module) {
    console.log('[Antivirus] Starting scan worker...');
    setInterval(processPendingScans, 30000);
    processPendingScans();
}
