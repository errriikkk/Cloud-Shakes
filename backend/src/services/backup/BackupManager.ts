// @ts-ignore
import { BackupConfig } from '@prisma/client';

import { BackupStrategy, BackupResult, RestoreResult } from './BackupStrategy';
import { LocalStrategy } from './LocalStrategy';
import { S3Strategy } from './S3Strategy';
import { SSHStrategy } from './SSHStrategy';
import { decryptCredential } from '../../utils/encryption';

export class BackupManager {
  private getStrategy(type: string): BackupStrategy {
    switch (type) {
      case 'local': return new LocalStrategy();
      case 's3': return new S3Strategy();
      case 'ssh': return new SSHStrategy();
      default: throw new Error(`Unknown backup strategy type: ${type}`);
    }
  }

  private decryptConfig(config: BackupConfig): BackupConfig {
    // Decrypt sensitive credentials
    return {
      ...config,
      s3AccessKey: (config as any).s3AccessKey ? decryptCredential((config as any).s3AccessKey) : null,
      s3SecretKey: (config as any).s3SecretKey ? decryptCredential((config as any).s3SecretKey) : null,
      sshPassword: (config as any).sshPassword ? decryptCredential((config as any).sshPassword) : null,
      sshKey: (config as any).sshKey ? decryptCredential((config as any).sshKey) : null,
    } as any;

  }

  async executeBackup(config: BackupConfig): Promise<BackupResult> {
    const strategy = this.getStrategy(config.type);
    const decryptedConfig = this.decryptConfig(config);
    return strategy.execute(decryptedConfig);
  }

  async restoreBackup(config: BackupConfig, filename: string): Promise<RestoreResult> {
    const strategy = this.getStrategy(config.type);
    const decryptedConfig = this.decryptConfig(config);
    return strategy.restore(decryptedConfig, filename);
  }
}
