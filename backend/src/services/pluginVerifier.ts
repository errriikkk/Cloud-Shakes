import { createHash } from 'crypto';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

const PLUGIN_PUBLIC_KEY = process.env.PLUGIN_PUBLIC_KEY || '';
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || '/data/plugins';
const PLUGIN_CACHE_TTL = parseInt(process.env.PLUGIN_CACHE_TTL || '600'); // 10 minutos

interface PluginVersion {
  name: string;
  displayName: string;
  version: string;
  downloadUrl: string;
  checksum: string;
  signature: string;
  capabilities: string[];
  runtime: string;
  entryPoint: string;
  memoryLimit: string;
  timeout: number;
  ioTimeout: number;
}

interface CachedPlugin {
  version: PluginVersion;
  downloadedAt: number;
  localPath: string;
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const da = Number.isFinite(pa[i]) ? pa[i] : 0;
    const db = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (da !== db) return db - da;
  }
  return 0;
}

function checksumToBytes(checksum: string): Uint8Array {
  const normalized = checksum.trim();

  // Support SHA256 hex (current backend default)
  if (/^[a-fA-F0-9]{64}$/.test(normalized)) {
    return Uint8Array.from(Buffer.from(normalized, 'hex'));
  }

  // Fallback to base64 for backward compatibility
  return decodeBase64(normalized);
}

class PluginVerifier {
  private cache: Map<string, CachedPlugin> = new Map();
  private cacheMetaPath: string;

  constructor() {
    this.cacheMetaPath = join(PLUGIN_CACHE_DIR, 'cache-meta.json');
    this.loadCacheMeta();
  }

  private loadCacheMeta(): void {
    try {
      if (existsSync(this.cacheMetaPath)) {
        const data = JSON.parse(readFileSync(this.cacheMetaPath, 'utf-8'));
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Failed to load cache meta:', error);
    }
  }

  private saveCacheMeta(): void {
    try {
      const data = Object.fromEntries(this.cache);
      writeFileSync(this.cacheMetaPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save cache meta:', error);
    }
  }

  verifyChecksum(fileBuffer: Buffer, expectedChecksum: string): boolean {
    const calculated = createHash('sha256').update(fileBuffer).digest('hex');
    return calculated === expectedChecksum;
  }

  verifySignature(checksum: string, signature: string): boolean {
    if (!PLUGIN_PUBLIC_KEY) {
      console.warn('PLUGIN_PUBLIC_KEY not configured, skipping signature verification');
      return true;
    }

    try {
      const checksumBuffer = checksumToBytes(checksum);
      const signatureBuffer = decodeBase64(signature);
      const publicKeyBuffer = decodeBase64(PLUGIN_PUBLIC_KEY);
      
      return nacl.sign.detached.verify(checksumBuffer, signatureBuffer, publicKeyBuffer);
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  async downloadAndVerify(version: PluginVersion): Promise<string> {
    const pluginDir = join(PLUGIN_CACHE_DIR, version.name, version.version);
    
    if (!existsSync(pluginDir)) {
      mkdirSync(pluginDir, { recursive: true });
    }

    const zipPath = join(pluginDir, 'plugin.zip');
    const sigPath = join(pluginDir, 'plugin.sig');

    const response = await fetch(version.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download plugin: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    if (!this.verifyChecksum(fileBuffer, version.checksum)) {
      throw new Error('Checksum verification failed');
    }

    if (!this.verifySignature(version.checksum, version.signature)) {
      throw new Error('Signature verification failed');
    }

    writeFileSync(zipPath, fileBuffer);
    writeFileSync(sigPath, version.signature);

    const manifest = {
      name: version.name,
      displayName: version.displayName,
      version: version.version,
      checksum: version.checksum,
      signature: version.signature,
      capabilities: version.capabilities,
      runtime: version.runtime,
      entryPoint: version.entryPoint,
      downloadedAt: Date.now()
    };
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    this.cache.set(`${version.name}:${version.version}`, {
      version,
      downloadedAt: Date.now(),
      localPath: pluginDir
    });
    this.saveCacheMeta();

    return pluginDir;
  }

  async installPlugin(version: PluginVersion): Promise<string> {
    const pluginDir = await this.downloadAndVerify(version);
    
    const activeLink = join(PLUGIN_CACHE_DIR, version.name, 'active');
    
    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }
    
    symlinkSync(pluginDir, activeLink);

    return activeLink;
  }

  getCachedVersion(name: string, version: string): CachedPlugin | undefined {
    return this.cache.get(`${name}:${version}`);
  }

  isCacheValid(name: string, version: string): boolean {
    const cached = this.cache.get(`${name}:${version}`);
    if (!cached) return false;
    
    const age = Date.now() - cached.downloadedAt;
    return age < PLUGIN_CACHE_TTL * 1000;
  }

  cleanupOldVersions(pluginName: string, keepCount: number = 3): void {
    const pluginBaseDir = join(PLUGIN_CACHE_DIR, pluginName);
    
    if (!existsSync(pluginBaseDir)) return;

    const versions = readdirSync(pluginBaseDir)
      .filter(v => v !== 'active' && v !== 'cache-meta.json')
      .sort(compareSemverDesc);

    if (versions.length <= keepCount) return;

    const toDelete = versions.slice(keepCount);
    for (const version of toDelete) {
      const versionDir = join(pluginBaseDir, version);
      try {
        const files = readdirSync(versionDir);
        for (const file of files) {
          unlinkSync(join(versionDir, file));
        }
        require('fs').rmdirSync(versionDir);
      } catch (error) {
        console.error(`Failed to delete old version ${version}:`, error);
      }
    }
  }

  async verifyInstalled(name: string, version: string): Promise<boolean> {
    const pluginDir = join(PLUGIN_CACHE_DIR, name, version);
    const manifestPath = join(pluginDir, 'manifest.json');
    const sigPath = join(pluginDir, 'plugin.sig');

    if (!existsSync(manifestPath) || !existsSync(sigPath)) {
      return false;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const signature = readFileSync(sigPath, 'utf-8');

    return this.verifySignature(manifest.checksum, signature);
  }
}

export const pluginVerifier = new PluginVerifier();
export default pluginVerifier;
