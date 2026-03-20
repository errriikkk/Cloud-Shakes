import { BackupConfig } from '@prisma/client';
import { BackupStrategy, BackupResult, RestoreResult } from './BackupStrategy';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

export class LocalStrategy implements BackupStrategy {
  async execute(config: BackupConfig): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql.gz`;
    const targetDir = config.localPath || '/tmp/backups';
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filepath = path.join(targetDir, filename);
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) throw new Error("DATABASE_URL not set");

    const cmd = `pg_dump "${dbUrl}" | gzip > "${filepath}"`;
    await execPromise(cmd);

    const stats = fs.statSync(filepath);

    return {
      log: `Local backup created successfully at ${filepath}`,
      size: stats.size,
      filename
    };
  }

  async restore(config: BackupConfig, filename: string): Promise<RestoreResult> {
    const targetDir = config.localPath || '/tmp/backups';
    const filepath = path.join(targetDir, filename);

    if (!fs.existsSync(filepath)) throw new Error("Backup file not found locally.");

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set");

    const cmd = `gunzip -c "${filepath}" | psql "${dbUrl}"`;
    await execPromise(cmd);

    return {
      log: `Restored successfully from ${filepath}`,
      success: true
    };
  }
}
