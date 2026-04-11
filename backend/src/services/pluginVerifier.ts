import { createHash } from 'crypto';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, rmSync, renameSync, statSync } from 'fs';
import { join } from 'path';
import extractZip from 'extract-zip';

const PLUGIN_PUBLIC_KEY = process.env.PLUGIN_PUBLIC_KEY || '';
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || join(process.cwd(), 'data', 'plugins');
const PLUGIN_CACHE_TTL = parseInt(process.env.PLUGIN_CACHE_TTL || '600'); // 10 minutos

interface PluginVersion {
  name: string;
  displayName: string;
  version: string;
  downloadUrl: string;
  checksum: string;
  signature: string;
  licenseJwt?: string;
  capabilities: string[];
  runtime: string;
  entryPoint: string;
  memoryLimit: string;
  timeout: number;
  ioTimeout: number;
  downloadUrls?: string[];
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

    // Reinstalling same version should be idempotent.
    // Clean stale partial files from previous failed extraction attempts.
    rmSync(pluginDir, { recursive: true, force: true });
    mkdirSync(pluginDir, { recursive: true });

    const zipPath = join(pluginDir, 'plugin.zip');
    const sigPath = join(pluginDir, 'plugin.sig');

    const candidateUrls = Array.from(
      new Set([version.downloadUrl, ...(version.downloadUrls || [])].filter(Boolean))
    );

    let response: Response | null = null;
    let lastError = 'Not Found';
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          response = res;
          break;
        }
        lastError = `${res.status} ${res.statusText}`.trim();
      } catch (error: any) {
        lastError = error?.message || 'Network error';
      }
    }

    if (!response) {
      throw new Error(`Failed to download plugin: ${lastError}`);
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
    await this.extractPluginZip(zipPath, pluginDir);
    this.ensureRuntimeManifest(pluginDir, version);

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

    if (version.licenseJwt) {
      writeFileSync(join(pluginDir, 'license.jwt'), version.licenseJwt);
    }

    this.cache.set(`${version.name}:${version.version}`, {
      version,
      downloadedAt: Date.now(),
      localPath: pluginDir
    });
    this.saveCacheMeta();

    return pluginDir;
  }

  private ensureRuntimeManifest(pluginDir: string, version: PluginVersion): void {
    const runtimeManifestPath = join(pluginDir, 'plugin.json');
    if (existsSync(runtimeManifestPath)) return;

    let source: any = null;
    const shakesManifestPath = join(pluginDir, 'shakes.json');
    const legacyManifestPath = join(pluginDir, 'manifest.json');

    try {
      if (existsSync(shakesManifestPath)) {
        source = JSON.parse(readFileSync(shakesManifestPath, 'utf-8'));
      } else if (existsSync(legacyManifestPath)) {
        source = JSON.parse(readFileSync(legacyManifestPath, 'utf-8'));
      }
    } catch (error) {
      console.warn('[PluginVerifier] Could not parse source manifest, generating fallback plugin.json', error);
    }

    const normalized = {
      name: source?.name || version.name,
      version: source?.version || version.version,
      displayName: source?.displayName || source?.name || version.displayName || version.name,
      description: source?.description || '',
      apiVersion: '1.0',
      capabilities: Array.isArray(source?.capabilities) ? source.capabilities : (version.capabilities || []),
      runtime: source?.runtime || version.runtime || 'js',
      entryPoint: source?.entryPoint || version.entryPoint || 'index.js',
      memoryLimit: source?.memoryLimit || version.memoryLimit || '128Mi',
      timeout: source?.timeout || version.timeout || 5,
      ioTimeout: source?.ioTimeout || version.ioTimeout || 30,
      author: source?.author || 'unknown',
      website: source?.website,
      repository: source?.repository,
      license: source?.license || 'MIT',
      slots: Array.isArray(source?.slots) ? source.slots : [],
      checksum: version.checksum,
      signature: version.signature,
    };

    writeFileSync(runtimeManifestPath, JSON.stringify(normalized, null, 2));
  }

  private async extractPluginZip(zipPath: string, targetDir: string): Promise<void> {
    const tempDir = join(targetDir, `.tmp-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      await extractZip(zipPath, { dir: tempDir });
      const extracted = readdirSync(tempDir);
      if (extracted.length === 1 && statSync(join(tempDir, extracted[0])).isDirectory()) {
        const inner = join(tempDir, extracted[0]);
        for (const item of readdirSync(inner)) {
          const destination = join(targetDir, item);
          rmSync(destination, { recursive: true, force: true });
          renameSync(join(inner, item), join(targetDir, item));
        }
      } else {
        for (const item of extracted) {
          const destination = join(targetDir, item);
          rmSync(destination, { recursive: true, force: true });
          renameSync(join(tempDir, item), join(targetDir, item));
        }
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
    const jwtPath = join(pluginDir, 'license.jwt');

    if (!existsSync(manifestPath) || !existsSync(sigPath)) {
      return false;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const signature = readFileSync(sigPath, 'utf-8');

    if (existsSync(jwtPath)) {
      const jwtContent = readFileSync(jwtPath, 'utf-8');
      // In a full implementation, we'd verify the JWT signature offline here.
      // E.g., jsonwebtoken.verify(jwtContent, PLUGIN_PUBLIC_KEY)
      // For now, having it cached locally allows offline booting to proceed.
      if (!jwtContent.trim()) return false;
    }

    return this.verifySignature(manifest.checksum, signature);
  }
}

export const pluginVerifier = new PluginVerifier();
export default pluginVerifier;
