/**
 * Plugin Runtime Service
 * Integración del nuevo runtime con el sistema existente
 * @version 1.0.0
 */

import type { PluginManifest } from '../plugins/runtime/types.js';
import { PluginRuntime } from '../plugins/runtime/index.js';
import { PluginSandbox } from '../plugins/runtime/sandbox.js';
import { pluginVerifier } from './pluginVerifier.js';
import { pluginUpdateService } from './pluginUpdateService.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || join(process.cwd(), 'data', 'plugins');

/**
 * Servicio de integración entre el runtime nuevo y el sistema legacy
 */
export class PluginRuntimeService {
  private runtime: PluginRuntime;
  private activePlugins: Map<string, { name: string; version: string }> = new Map();

  constructor() {
    this.runtime = new PluginRuntime({
      memoryLimitMB: 128,
      timeoutMs: 5000,
    });
  }

  /**
   * Inicializa el runtime y carga plugins activos
   */
  async initialize(): Promise<void> {
    console.log('[PluginRuntimeService] Initializing...');

    // Cargar plugins instalados desde el sistema legacy
    const installed = this.getInstalledPluginsLegacy();

    for (const plugin of installed) {
      if (plugin.isActive) {
        try {
          await this.activatePlugin(plugin.name, plugin.version);
        } catch (error) {
          console.error(`[PluginRuntimeService] Failed to activate ${plugin.name}:`, error);
        }
      }
    }

    console.log('[PluginRuntimeService] Initialized');
  }

  /**
   * Activa un plugin en el runtime
   */
  async activatePlugin(name: string, version: string): Promise<void> {
    const pluginDir = join(PLUGIN_CACHE_DIR, name, version);

    if (!existsSync(pluginDir)) {
      throw new Error(`Plugin not found: ${name}@${version}`);
    }

    // 1. Verificar con el sistema legacy
    const isValid = await pluginVerifier.verifyInstalled(name, version);
    if (!isValid) {
      throw new Error(`Plugin verification failed: ${name}@${version}`);
    }

    // 2. Cargar manifest
    const manifest = this.loadManifest(pluginDir);

    // 3. Cargar código
    const entryPath = join(pluginDir, manifest.entryPoint);
    const code = readFileSync(entryPath, 'utf-8');

    // 4. Validar código con sandbox
    const validation = PluginSandbox.validateCode(code, manifest.capabilities);
    if (!validation.valid) {
      throw new Error(`Code validation failed: ${validation.error}`);
    }

    // 5. Activar en runtime
    const result = await this.runtime.activate(name, version);
    if (!result.success) {
      throw new Error(`Runtime activation failed: ${result.error}`);
    }

    this.activePlugins.set(name, { name, version });
    console.log(`[PluginRuntimeService] Activated ${name}@${version}`);
  }

  /**
   * Ejecuta un plugin
   */
  async executePlugin<T = unknown>(name: string, input: unknown): Promise<{
    success: boolean;
    result?: T;
    error?: string;
    logs: any[];
    duration: number;
    memoryUsed: number;
  }> {
    if (!this.activePlugins.has(name)) {
      return {
        success: false,
        error: `Plugin ${name} not active`,
        logs: [],
        duration: 0,
        memoryUsed: 0,
      };
    }

    return this.runtime.execute<T>(name, input);
  }

  /**
   * Desactiva un plugin
   */
  async deactivatePlugin(name: string): Promise<void> {
    this.runtime.deactivate(name);
    this.activePlugins.delete(name);
    console.log(`[PluginRuntimeService] Deactivated ${name}`);
  }

  /**
   * Instala un plugin (integración con legacy)
   */
  async installPlugin(
    name: string,
    version: string,
    zipBuffer: Buffer,
    checksum: string,
    signature?: string
  ): Promise<void> {
    // 1. Verificar con sistema legacy
    const verified = pluginVerifier.verifyChecksum(zipBuffer, checksum);
    if (!verified) {
      throw new Error('Checksum verification failed');
    }

    if (signature) {
      const sigValid = pluginVerifier.verifySignature(checksum, signature);
      if (!sigValid) {
        throw new Error('Signature verification failed');
      }
    }

    // 2. Instalar con sistema legacy (descarga y extracción)
    const versionInfo = {
      name,
      displayName: name,
      version,
      downloadUrl: '', // No se usa porque ya tenemos el buffer
      checksum,
      signature: signature || '',
      capabilities: [],
      runtime: 'js',
      entryPoint: 'index.js',
      memoryLimit: '128Mi',
      timeout: 5,
      ioTimeout: 30,
    };

    await pluginVerifier.downloadAndVerify(versionInfo);

    console.log(`[PluginRuntimeService] Installed ${name}@${version}`);
  }

  /**
   * Obtiene plugins instalados (formato legacy)
   */
  private getInstalledPluginsLegacy(): Array<{
    name: string;
    version: string;
    isActive: boolean;
  }> {
    const plugins: Array<{ name: string; version: string; isActive: boolean }> = [];

    try {
      if (!existsSync(PLUGIN_CACHE_DIR)) {
        return plugins;
      }

      const entries = require('fs').readdirSync(PLUGIN_CACHE_DIR);

      for (const entry of entries) {
        const pluginDir = join(PLUGIN_CACHE_DIR, entry);
        const activeLink = join(pluginDir, 'active');
        const isActive = existsSync(activeLink);

        // Obtener versiones
        const versions = require('fs').readdirSync(pluginDir)
          .filter((v: string) => v !== 'active' && v !== 'cache-meta.json');

        if (versions.length > 0) {
          const currentVersion = isActive
            ? require('fs').readlinkSync(activeLink).split('/').pop()
            : versions[0];

          plugins.push({
            name: entry,
            version: currentVersion,
            isActive,
          });
        }
      }
    } catch (error) {
      console.error('[PluginRuntimeService] Error reading plugins:', error);
    }

    return plugins;
  }

  /**
   * Carga manifest de plugin
   */
  private loadManifest(pluginDir: string): PluginManifest {
    const manifestPath = join(pluginDir, 'plugin.json');

    if (!existsSync(manifestPath)) {
      // Default manifest si no existe
      return {
        name: require('path').basename(pluginDir),
        version: '1.0.0',
        displayName: 'Unknown Plugin',
        apiVersion: '1.0',
        capabilities: [],
        runtime: 'js',
        entryPoint: 'index.js',
        memoryLimit: '128Mi',
        timeout: 5,
        author: 'unknown',
      };
    }

    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  }

  /**
   * Obtiene estadísticas de un plugin
   */
  getPluginStats(name: string) {
    return this.runtime.getStats(name);
  }

  /**
   * Verifica salud de un plugin
   */
  healthCheck(name: string): { healthy: boolean; error?: string } {
    return this.runtime.checkHealth(name);
  }

  /**
   * Lista plugins activos
   */
  getActivePlugins(): string[] {
    return this.runtime.getActivePlugins();
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.runtime.dispose();
    this.activePlugins.clear();
  }
}

// Singleton
export const pluginRuntimeService = new PluginRuntimeService();
export default pluginRuntimeService;
