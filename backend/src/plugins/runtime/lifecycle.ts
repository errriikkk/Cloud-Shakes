/**
 * Plugin Lifecycle Management
 * install → enable → disable → uninstall → rollback
 * @version 1.0.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import type { PluginManifest, PluginInstance, PluginStatus } from './types.js';
import { loadManifest, verifyIntegrity, extractPlugin, getActivePlugin, getPluginVersions } from './loader.js';

// Configuración
const PLUGIN_BASE_DIR = process.env.PLUGIN_DIR || resolve(process.cwd(), 'data', 'plugins');
const MAX_OLD_VERSIONS = 3; // Número de versiones viejas a mantener

interface LifecycleResult {
  success: boolean;
  error?: string;
}

interface InstallOptions {
  verifyChecksum?: boolean;
  verifySignature?: boolean;
  publicKey?: string;
}

interface EnableOptions {
  migrateConfig?: boolean;
}

// ─── Install ───────────────────────────────────────────────────────────────

/**
 * Instala un plugin desde buffer ZIP
 */
export async function install(
  zipBuffer: Buffer,
  manifest: PluginManifest,
  options: InstallOptions = {}
): Promise<LifecycleResult> {
  const { verifyChecksum = true, verifySignature = false, publicKey } = options;

  try {
    // 1. Verificar integridad si hay checksum
    if (verifyChecksum && manifest.checksum) {
      const result = verifyIntegrity(
        zipBuffer,
        manifest.checksum,
        verifySignature ? manifest.signature : undefined,
        publicKey
      );

      if (!result.valid) {
        return {
          success: false,
          error: `Integrity check failed: ${result.error}`,
        };
      }
    }

    // 2. Crear directorio destino
    const pluginDir = join(PLUGIN_BASE_DIR, manifest.name, manifest.version);
    
    if (existsSync(pluginDir)) {
      return {
        success: false,
        error: `Plugin ${manifest.name}@${manifest.version} already installed`,
      };
    }

    mkdirSync(pluginDir, { recursive: true });

    // 3. Extraer ZIP
    await extractPlugin(zipBuffer, pluginDir);

    // 4. Verificar manifest extraído
    try {
      loadManifest(pluginDir);
    } catch (error) {
      // Cleanup
      rmSync(pluginDir, { recursive: true, force: true });
      return {
        success: false,
        error: `Invalid plugin structure: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }

    // 5. Guardar estado
    saveState(manifest.name, manifest.version, 'installed');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Installation failed',
    };
  }
}

// ─── Enable ────────────────────────────────────────────────────────────────

/**
 * Activa un plugin (crea symlink 'active' a la versión)
 */
export function enable(
  name: string,
  version: string,
  options: EnableOptions = {}
): LifecycleResult {
  try {
    const pluginDir = join(PLUGIN_BASE_DIR, name, version);
    
    if (!existsSync(pluginDir)) {
      return {
        success: false,
        error: `Plugin ${name}@${version} not installed`,
      };
    }

    // Verificar manifest
    const manifest = loadManifest(pluginDir);

    // Verificar compatibilidad de API
    if (manifest.apiVersion !== '1.0') {
      return {
        success: false,
        error: `Incompatible API version: ${manifest.apiVersion}`,
      };
    }

    // Crear/quitar symlink 'active'
    const activeLink = join(PLUGIN_BASE_DIR, name, 'active');
    
    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }

    // Crear symlink relativo
    const target = join('..', name, version); // Ruta desde plugins/name/active
    symlinkSync(target, activeLink);

    // Guardar estado
    saveState(name, version, 'enabled');

    // Cleanup versiones viejas
    cleanupOldVersions(name);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Enable failed',
    };
  }
}

// ─── Disable ───────────────────────────────────────────────────────────────

/**
 * Desactiva un plugin (elimina symlink 'active')
 */
export function disable(name: string): LifecycleResult {
  try {
    const activeLink = join(PLUGIN_BASE_DIR, name, 'active');
    
    if (!existsSync(activeLink)) {
      return {
        success: false,
        error: `Plugin ${name} is not enabled`,
      };
    }

    // Obtener versión actual antes de desactivar
    const current = getActivePlugin(name);
    const version = current?.version || 'unknown';

    // Quitar symlink
    unlinkSync(activeLink);

    // Guardar estado
    saveState(name, version, 'disabled');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Disable failed',
    };
  }
}

// ─── Uninstall ─────────────────────────────────────────────────────────────

/**
 * Desinstala un plugin (elimina todos los archivos)
 */
export function uninstall(name: string): LifecycleResult {
  try {
    const pluginDir = join(PLUGIN_BASE_DIR, name);
    
    if (!existsSync(pluginDir)) {
      return {
        success: false,
        error: `Plugin ${name} not found`,
      };
    }

    // 1. Desactivar si está activo
    const activeLink = join(pluginDir, 'active');
    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }

    // 2. Backup de config si existe
    const configBackup = backupConfig(name);

    // 3. Eliminar directorio completo
    rmSync(pluginDir, { recursive: true, force: true });

    // 4. Guardar estado
    saveState(name, 'all', 'uninstalled');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Uninstall failed',
    };
  }
}

// ─── Rollback ──────────────────────────────────────────────────────────────

/**
 * Rollback a la versión anterior
 */
export function rollback(name: string): LifecycleResult {
  try {
    const current = getActivePlugin(name);
    
    if (!current) {
      return {
        success: false,
        error: `No active plugin ${name} to rollback`,
      };
    }

    const versions = getPluginVersions(name);
    const currentIndex = versions.indexOf(current.version);

    if (currentIndex === -1 || currentIndex >= versions.length - 1) {
      return {
        success: false,
        error: `No previous version available for rollback`,
      };
    }

    const previousVersion = versions[currentIndex + 1];

    // Desactivar actual y activar anterior
    const disableResult = disable(name);
    if (!disableResult.success) {
      return disableResult;
    }

    const enableResult = enable(name, previousVersion);
    if (!enableResult.success) {
      // Intentar reactivar la versión original
      enable(name, current.version);
      return {
        success: false,
        error: `Rollback failed, restored to ${current.version}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Rollback failed',
    };
  }
}

// ─── Health Check ──────────────────────────────────────────────────────────

/**
 * Verifica que un plugin esté funcionando correctamente
 */
export function healthCheck(name: string): { healthy: boolean; error?: string } {
  const active = getActivePlugin(name);
  
  if (!active) {
    return {
      healthy: false,
      error: `Plugin ${name} is not enabled`,
    };
  }

  // Verificar que el entry point existe
  if (!existsSync(active.entryPath)) {
    return {
      healthy: false,
      error: `Entry point missing: ${active.manifest.entryPoint}`,
    };
  }

  return { healthy: true };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Guarda estado del plugin
 */
function saveState(name: string, version: string, status: PluginStatus): void {
  const statePath = join(PLUGIN_BASE_DIR, name, 'state.json');
  const state = {
    name,
    version,
    status,
    updatedAt: Date.now(),
  };

  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`[Lifecycle] Failed to save state for ${name}:`, error);
  }
}

/**
 * Lee estado del plugin
 */
export function loadState(name: string): { status: PluginStatus; version: string; updatedAt: number } | null {
  const statePath = join(PLUGIN_BASE_DIR, name, 'state.json');
  
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Backup de config
 */
function backupConfig(name: string): Record<string, unknown> | null {
  const configPath = join(PLUGIN_BASE_DIR, name, 'active', 'config.json');
  
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    // Guardar backup
    const backupPath = join(PLUGIN_BASE_DIR, name, 'config-backup.json');
    writeFileSync(backupPath, JSON.stringify(config, null, 2));
    
    return config;
  } catch {
    return null;
  }
}

/**
 * Elimina versiones viejas, manteniendo MAX_OLD_VERSIONS
 */
function cleanupOldVersions(name: string): void {
  try {
    const versions = getPluginVersions(name);
    const active = getActivePlugin(name);
    const activeVersion = active?.version;

    if (versions.length <= MAX_OLD_VERSIONS) {
      return;
    }

    const toDelete = versions
      .filter(v => v !== activeVersion)
      .slice(MAX_OLD_VERSIONS);

    for (const version of toDelete) {
      const versionDir = join(PLUGIN_BASE_DIR, name, version);
      try {
        rmSync(versionDir, { recursive: true, force: true });
        console.log(`[Lifecycle] Cleaned up old version: ${name}@${version}`);
      } catch (error) {
        console.error(`[Lifecycle] Failed to cleanup ${name}@${version}:`, error);
      }
    }
  } catch (error) {
    console.error(`[Lifecycle] Cleanup failed for ${name}:`, error);
  }
}

// ─── Default Export ──────────────────────────────────────────────────────

export default {
  install,
  enable,
  disable,
  uninstall,
  rollback,
  healthCheck,
  loadState,
};
