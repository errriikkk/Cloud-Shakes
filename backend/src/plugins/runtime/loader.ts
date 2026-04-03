/**
 * Plugin Loader
 * Carga plugins con verificación de checksum y firma
 * @version 1.0.0
 */

import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import extractZip from 'extract-zip';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import type {
  Capability,
  PluginManifest,
  PluginInstance,
} from './types.js';
import { PluginRuntimeError } from './types.js';

// Configuración
const PLUGIN_BASE_DIR = process.env.PLUGIN_DIR || resolve(process.cwd(), 'data', 'plugins');
const PUBLIC_KEY = process.env.PLUGIN_PUBLIC_KEY || '';

interface LoadResult {
  success: boolean;
  instance?: PluginInstance;
  error?: string;
}

interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Calcula SHA256 de un buffer
 */
export function calculateChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calcula SHA256 de un archivo
 */
export async function calculateFileChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  
  stream.on('data', (chunk) => hash.update(chunk));
  
  return new Promise((resolve, reject) => {
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verifica la firma Ed25519 de un plugin
 */
export function verifySignature(
  checksum: string,
  signature: string,
  publicKey?: string
): VerificationResult {
  const key = publicKey || PUBLIC_KEY;
  
  if (!key) {
    // Sin clave pública, saltamos verificación (solo dev)
    console.warn('[Loader] No public key configured, skipping signature verification');
    return { valid: true };
  }

  try {
    const checksumBuffer = Buffer.from(checksum, 'hex');
    const signatureBuffer = decodeBase64(signature);
    const publicKeyBuffer = decodeBase64(key);
    
    const valid = nacl.sign.detached.verify(
      checksumBuffer,
      signatureBuffer,
      publicKeyBuffer
    );

    return { valid };
  } catch (error) {
    return {
      valid: false,
      error: `Signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

/**
 * Verifica integridad del plugin (checksum + firma)
 */
export function verifyIntegrity(
  buffer: Buffer,
  expectedChecksum: string,
  signature?: string,
  publicKey?: string
): VerificationResult {
  // 1. Verificar checksum
  const calculatedChecksum = calculateChecksum(buffer);
  if (calculatedChecksum !== expectedChecksum) {
    return {
      valid: false,
      error: `Checksum mismatch: expected ${expectedChecksum}, got ${calculatedChecksum}`,
    };
  }

  // 2. Verificar firma (si hay)
  if (signature) {
    const sigResult = verifySignature(expectedChecksum, signature, publicKey);
    if (!sigResult.valid) {
      return sigResult;
    }
  }

  return { valid: true };
}

/**
 * Extrae plugin ZIP a directorio
 */
export async function extractPlugin(
  zipBuffer: Buffer,
  targetDir: string
): Promise<void> {
  // Crear directorio temporal
  const tempDir = join(targetDir, '.temp-' + randomBytes(4).toString('hex'));
  mkdirSync(tempDir, { recursive: true });

  try {
    // Escribir ZIP temporal
    const tempZip = join(tempDir, 'plugin.zip');
    writeFileSync(tempZip, zipBuffer);

    // Extraer
    await extractZip(tempZip, { dir: tempDir });

    // Limpiar ZIP
    rmSync(tempZip);

    // Mover contenido al target (maneja plugins con o sin carpeta raíz)
    const extracted = readdirSync(tempDir);
    
    if (extracted.length === 1 && isDirectory(join(tempDir, extracted[0]))) {
      // El ZIP tenía una carpeta raíz, mover su contenido
      const innerDir = join(tempDir, extracted[0]);
      for (const item of readdirSync(innerDir)) {
        const src = join(innerDir, item);
        const dest = join(targetDir, item);
        // Mover archivo/directorio
        require('fs').renameSync(src, dest);
      }
    } else {
      // El ZIP no tenía carpeta raíz, mover todo
      for (const item of extracted) {
        const src = join(tempDir, item);
        const dest = join(targetDir, item);
        require('fs').renameSync(src, dest);
      }
    }

    // Limpiar temp
    rmSync(tempDir, { recursive: true });
  } catch (error) {
    // Cleanup on error
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

/**
 * Lee y valida el manifest de un plugin
 */
export function loadManifest(pluginDir: string): PluginManifest {
  const manifestPath = join(pluginDir, 'plugin.json');
  
  if (!existsSync(manifestPath)) {
    throw new PluginRuntimeError(
      `Manifest not found: ${manifestPath}`,
      'INVALID_MANIFEST'
    );
  }

  const content = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(content) as PluginManifest;

  // Validaciones básicas
  if (!manifest.name || !manifest.version || !manifest.apiVersion) {
    throw new PluginRuntimeError(
      'Invalid manifest: missing required fields (name, version, apiVersion)',
      'INVALID_MANIFEST'
    );
  }

  if (!manifest.entryPoint) {
    throw new PluginRuntimeError(
      'Invalid manifest: missing entryPoint',
      'INVALID_MANIFEST'
    );
  }

  const entryPath = join(pluginDir, manifest.entryPoint);
  if (!existsSync(entryPath)) {
    throw new PluginRuntimeError(
      `Entry point not found: ${manifest.entryPoint}`,
      'INVALID_MANIFEST'
    );
  }

  return manifest;
}

/**
 * Carga un plugin instalado
 */
export function loadPluginInstance(
  name: string,
  version: string
): LoadResult {
  try {
    const pluginDir = join(PLUGIN_BASE_DIR, name, version);
    
    if (!existsSync(pluginDir)) {
      return {
        success: false,
        error: `Plugin not found: ${name}@${version}`,
      };
    }

    const manifest = loadManifest(pluginDir);

    // Verificar que coincida la versión
    if (manifest.version !== version) {
      return {
        success: false,
        error: `Version mismatch: expected ${version}, got ${manifest.version}`,
      };
    }

    // Cargar config si existe
    const configPath = join(pluginDir, 'config.json');
    const config = existsSync(configPath)
      ? JSON.parse(readFileSync(configPath, 'utf-8'))
      : {};

    const instance: PluginInstance = {
      id: `${name}@${version}`,
      name,
      version,
      status: 'installed',
      manifest,
      config,
      capabilities: manifest.capabilities,
      path: pluginDir,
      entryPath: join(pluginDir, manifest.entryPoint),
      installedAt: getInstallTime(pluginDir),
    };

    return { success: true, instance };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Obtiene lista de plugins instalados
 */
export function getInstalledPlugins(): PluginInstance[] {
  const instances: PluginInstance[] = [];

  if (!existsSync(PLUGIN_BASE_DIR)) {
    return instances;
  }

  for (const pluginName of readdirSync(PLUGIN_BASE_DIR)) {
    const pluginDir = join(PLUGIN_BASE_DIR, pluginName);
    if (!isDirectory(pluginDir)) continue;

    for (const version of readdirSync(pluginDir)) {
      const versionDir = join(pluginDir, version);
      if (!isDirectory(versionDir)) continue;
      if (version === 'active') continue; // Skip symlink

      const result = loadPluginInstance(pluginName, version);
      if (result.success && result.instance) {
        instances.push(result.instance);
      }
    }
  }

  return instances;
}

/**
 * Obtiene el plugin activo (el que apunta el symlink 'active')
 */
export function getActivePlugin(name: string): PluginInstance | null {
  const activeLink = join(PLUGIN_BASE_DIR, name, 'active');
  
  if (!existsSync(activeLink)) {
    return null;
  }

  try {
    const target = require('fs').readlinkSync(activeLink);
    const version = require('path').basename(target);
    const result = loadPluginInstance(name, version);
    
    if (result.success && result.instance) {
      result.instance.status = 'enabled';
      return result.instance;
    }
  } catch {
    // Broken symlink
  }

  return null;
}

/**
 * Obtiene todas las versiones de un plugin
 */
export function getPluginVersions(name: string): string[] {
  const pluginDir = join(PLUGIN_BASE_DIR, name);
  
  if (!existsSync(pluginDir)) {
    return [];
  }

  return readdirSync(pluginDir)
    .filter(v => {
      const dir = join(pluginDir, v);
      return isDirectory(dir) && v !== 'active';
    })
    .sort(compareSemverDesc);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isDirectory(path: string): boolean {
  try {
    return require('fs').statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function getInstallTime(pluginDir: string): number {
  try {
    const stat = require('fs').statSync(pluginDir);
    return stat.mtimeMs;
  } catch {
    return Date.now();
  }
}

function compareSemverDesc(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10));
  const pa = parse(a);
  const pb = parse(b);
  
  for (let i = 0; i < 3; i++) {
    const da = Number.isFinite(pa[i]) ? pa[i] : 0;
    const db = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (da !== db) return db - da; // Descending
  }
  return 0;
}

// ─── Default Export ────────────────────────────────────────────────────────

export default {
  calculateChecksum,
  calculateFileChecksum,
  verifySignature,
  verifyIntegrity,
  extractPlugin,
  loadManifest,
  loadPluginInstance,
  getInstalledPlugins,
  getActivePlugin,
  getPluginVersions,
};
