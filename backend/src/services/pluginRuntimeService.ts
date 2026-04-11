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
import { join, basename } from 'path';
import path from 'path';
import { pluginRouteRegistry } from '../plugins/runtime/routeRegistry.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';

const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || join(process.cwd(), 'data', 'plugins');

/**
 * Servicio de integración entre el runtime nuevo y el sistema legacy
 */
export class PluginRuntimeService {
  private runtime: PluginRuntime;
  private activePlugins: Map<string, { name: string; version: string }> = new Map();
  private hostActivatedVersions: Map<string, string> = new Map();

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
    
    // 6. Host-level Activation (Route Registration)
    await this.hostActivate(name, version);

    // 7. Trigger Sandbox onActivate Hook if it exists
    try {
      if (manifest.hooks?.includes('onActivate')) {
        await this.runtime.execute(name, { type: 'lifecycle', hook: 'onActivate' });
      }
    } catch (e) {
      console.warn(`[PluginRuntimeService] Plugin ${name} sandbox onActivate failed:`, e);
    }

    console.log(`[PluginRuntimeService] Fully activated ${name}@${version}`);
  }

  /**
   * Performs host-level activation (Express routes registration)
   */
  async hostActivate(name: string, version: string): Promise<void> {
    const pluginDir = join(PLUGIN_CACHE_DIR, name, version);
    const manifest = this.loadManifest(pluginDir);
    const entryPoint = manifest.entryPoint || 'index.js';
    const entryPath = join(pluginDir, entryPoint);

    if (!existsSync(entryPath)) return;

    // Hot-reload support: clear require cache
    try {
      delete require.cache[require.resolve(entryPath)];
    } catch {}

    try {
      const mod = require(entryPath);
      let runtimeExport = mod?.default || mod;

      // Handle ShakesPlugin Class or Instance
      if (runtimeExport && runtimeExport.isShakesPlugin) {
        if (typeof runtimeExport === 'function') {
          const instance = new runtimeExport(name);
          runtimeExport = instance.export();
        } else {
          runtimeExport = runtimeExport.export();
        }
      }

      const onActivate = runtimeExport?.hooks?.onActivate || runtimeExport?.onActivate;
      const currentlyActivated = this.hostActivatedVersions.get(name);

      if (typeof onActivate === 'function' && currentlyActivated !== version) {
        if (currentlyActivated) {
          pluginRouteRegistry.unregister(name);
          console.log(`[PluginRuntimeService] Version change for ${name} (${currentlyActivated} -> ${version}). Unregistered old routes.`);
        }

        const api = this.createHostApi(name);
        const context = {
          plugin: { name, version }, // Legacy support
          manifest,                  // SDK v2 support
          config: {},
          log: (level: string, msg: string) => console.log(`[Plugin:${name}] ${level}: ${msg}`)
        };
        
        await Promise.resolve(onActivate(context, api));
        this.hostActivatedVersions.set(name, version);
        console.log(`[PluginRuntimeService] Registered host routes for ${name}`);
      }
    } catch (error) {
      console.warn(`[PluginRuntimeService] Host activation failed for ${name}:`, error);
    }
  }

  /**
   * Utility to create Host API for backend route registration
   */
  private createHostApi(pluginName: string) {
    const dataDir = join(PLUGIN_CACHE_DIR, pluginName, 'data');
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    return {
      routes: pluginRouteRegistry.getApiForPlugin(pluginName),
      system: {
        log: (level: string, msg: string) => console.log(`[Plugin:${pluginName}] ${level}: ${msg}`)
      },
      storage: {
        read: (filename: string) => {
          const filePath = join(dataDir, filename);
          if (!filePath.startsWith(dataDir)) throw new Error('Security: Out of bounds access');
          if (!existsSync(filePath)) return null;
          return readFileSync(filePath, 'utf-8');
        },
        write: (filename: string, content: string) => {
          const filePath = join(dataDir, filename);
          if (!filePath.startsWith(dataDir)) throw new Error('Security: Out of bounds access');
          writeFileSync(filePath, content, 'utf-8');
          return true;
        },
        exists: (filename: string) => {
          const filePath = join(dataDir, filename);
          return filePath.startsWith(dataDir) && existsSync(filePath);
        }
      }
    };
  }

  /**
   * Activates a sideloaded (locally uploaded) plugin, skipping CDN/checksum verification.
   * The user explicitly uploaded this ZIP so we trust it — but still run sandbox code validation.
   */
  async activateSideloadedPlugin(name: string, version: string): Promise<void> {
    const pluginDir = join(PLUGIN_CACHE_DIR, name, version);

    if (!existsSync(pluginDir)) {
      throw new Error(`Sideloaded plugin directory not found: ${name}@${version}`);
    }

    // Load manifest (support plugin.json, shakes.json, or manifest.json)
    const manifest = this.loadManifest(pluginDir);

    // Resolve entry point
    const entryPoint = manifest.entryPoint || 'index.js';
    const entryPath = join(pluginDir, entryPoint);

    if (!existsSync(entryPath)) {
      throw new Error(`Entry point "${entryPoint}" not found in sideloaded plugin ${name}@${version}`);
    }

    const code = readFileSync(entryPath, 'utf-8');

    // Still run sandbox static code validation (safety baseline)
    const validation = PluginSandbox.validateCode(code, manifest.capabilities || []);
    if (!validation.valid) {
      throw new Error(`Sideloaded plugin code validation failed: ${validation.error}`);
    }

    // Activate in runtime (no CDN verification)
    const result = await this.runtime.activate(name, version);
    if (!result.success) {
      throw new Error(`Runtime activation failed for sideloaded ${name}: ${result.error}`);
    }

    this.activePlugins.set(name, { name, version });

    // Trigger lifecycle hook if defined
    try {
      if (manifest.hooks?.includes('onActivate')) {
        await this.runtime.execute(name, { type: 'lifecycle', hook: 'onActivate' });
      }
    } catch (e) {
      console.warn(`[PluginRuntimeService] Sideloaded ${name} hit an error during onActivate:`, e);
    }

    console.log(`[PluginRuntimeService] Sideloaded plugin activated: ${name}@${version}`);
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
    // Trigger onDeactivate Hook
    try {
      if (this.activePlugins.has(name)) {
        await this.runtime.execute(name, { type: 'lifecycle', hook: 'onDeactivate' });
      }
    } catch (e) {
      console.warn(`[PluginRuntimeService] Plugin ${name} hit an error during onDeactivate:`, e);
    }

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
            ? path.basename(require('fs').readlinkSync(activeLink))
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
    // Try all known manifest filenames in order of preference
    const candidates = ['plugin.json', 'shakes.json', 'manifest.json'];
    for (const filename of candidates) {
      const manifestPath = join(pluginDir, filename);
      if (existsSync(manifestPath)) {
        return JSON.parse(readFileSync(manifestPath, 'utf-8'));
      }
    }

    // Default manifest if no file found (graceful fallback)
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
