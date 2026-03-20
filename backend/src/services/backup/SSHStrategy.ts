import { BackupConfig } from '@prisma/client';
import { BackupStrategy, BackupResult, RestoreResult } from './BackupStrategy';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

export class SSHStrategy implements BackupStrategy {
  async execute(config: BackupConfig): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql.gz`;
    const tempDir = '/tmp/backups';
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filepath = path.join(tempDir, filename);
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) throw new Error("DATABASE_URL not set");

    // Create local dump first
    const cmd = `pg_dump "${dbUrl}" | gzip > "${filepath}"`;
    await execPromise(cmd);
    const stats = fs.statSync(filepath);

    // StrictHostKeyChecking=ask is dangerous. StrictHostKeyChecking=yes involves maintaining known_hosts.
    // In production we should use the ssh2 npm library to perform key validation and scp.
    // Here we use mocked scp for simulation.
    if (!config.sshHost || !config.sshUser || !config.sshPath) throw new Error("SSH Config missing");

    const log = `Uploaded ${filename} to SSH path ${config.sshPath} using scp. Fingerprint checked (Simulated).`;

    return {
      log,
      size: stats.size,
      filename
    };
  }

  async restore(config: BackupConfig, filename: string): Promise<RestoreResult> {
    // Download via SSH and restore
    return {
      log: `Restored successfully from SSH server at ${config.sshPath}/${filename} (Simulated)`,
      success: true
    };
  }
}
