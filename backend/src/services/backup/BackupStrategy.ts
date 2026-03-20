import { BackupConfig } from '@prisma/client';

export interface BackupResult {
  log: string;
  size: number;
  filename: string;
}

export interface RestoreResult {
  log: string;
  success: boolean;
}

export interface BackupStrategy {
  execute(config: BackupConfig): Promise<BackupResult>;
  restore(config: BackupConfig, filename: string): Promise<RestoreResult>;
}
