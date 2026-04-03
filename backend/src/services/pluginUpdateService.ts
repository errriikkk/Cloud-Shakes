import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PLUGIN_REGISTRY_URL = process.env.PLUGIN_REGISTRY_URL || 'https://cdn.shakes.es';
const PLUGIN_LICENSE_KEY = process.env.PLUGIN_LICENSE_KEY || '';
const POLLING_INTERVAL = parseInt(process.env.PLUGIN_POLLING_INTERVAL || '21600000'); // 6 horas
const REVOCATION_CHECK_INTERVAL = parseInt(process.env.PLUGIN_REVOCATION_CHECK_INTERVAL || '900000'); // 15 minutos

interface Revocation {
  id: string;
  pluginId: string;
  pluginName?: string;
  version: string | null;
  reason: string;
  severity: string;
  createdAt: string;
}

class PluginUpdateService {
  private pollingTimer: NodeJS.Timeout | null = null;
  private revocationTimer: NodeJS.Timeout | null = null;
  private lastCheck: number = 0;
  private revocationList: Revocation[] = [];

  async start(): Promise<void> {
    console.log('Starting plugin update service...');
    
    await this.checkForUpdates();
    await this.checkRevocations();
    
    this.pollingTimer = setInterval(() => {
      this.checkForUpdates();
    }, POLLING_INTERVAL);
    
    this.revocationTimer = setInterval(() => {
      this.checkRevocations();
    }, REVOCATION_CHECK_INTERVAL);
    
    console.log(`Plugin update service started. Polling every ${POLLING_INTERVAL / 1000 / 60} minutes`);
  }

  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.revocationTimer) {
      clearInterval(this.revocationTimer);
      this.revocationTimer = null;
    }
    console.log('Plugin update service stopped');
  }

  async checkForUpdates(): Promise<void> {
    if (!PLUGIN_LICENSE_KEY) {
      console.warn('PLUGIN_LICENSE_KEY not configured');
      return;
    }

    try {
      const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/instances/plugins`, {
        headers: {
          'X-License-Key': PLUGIN_LICENSE_KEY
        }
      });

      if (!response.ok) {
        console.error('Failed to check for updates:', response.statusText);
        return;
      }

      const data = await response.json();
      console.log(`Found ${data.plugins?.length || 0} available plugins`);
      
      this.lastCheck = Date.now();
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  }

  async checkRevocations(): Promise<void> {
    if (!PLUGIN_LICENSE_KEY) {
      return;
    }

    try {
      const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/instances/revocation`, {
        headers: {
          'X-License-Key': PLUGIN_LICENSE_KEY
        }
      });

      if (!response.ok) {
        return;
      }

      const revocations: Revocation[] = await response.json();
      this.revocationList = revocations;

      for (const revocation of revocations) {
        await this.handleRevocation(revocation);
      }
    } catch (error) {
      console.error('Error checking revocations:', error);
    }
  }

  private async handleRevocation(revocation: Revocation): Promise<void> {
    console.log(`Handling revocation for ${revocation.pluginName || revocation.pluginId} v${revocation.version || 'all'}: ${revocation.reason}`);
    
    const pluginStatePath = join(process.cwd(), 'data', 'plugins', revocation.pluginId, 'revoked');
    
    writeFileSync(pluginStatePath, JSON.stringify({
      revocation,
      handledAt: Date.now()
    }, null, 2));
  }

  isPluginRevoked(pluginId: string, version?: string): boolean {
    return this.revocationList.some(r => {
      if (r.pluginId !== pluginId) return false;
      if (r.version === null) return true;
      return version && r.version === version;
    });
  }

  getRevocationList(): Revocation[] {
    return this.revocationList;
  }

  getLastCheckTime(): number {
    return this.lastCheck;
  }
}

export const pluginUpdateService = new PluginUpdateService();
export default pluginUpdateService;
