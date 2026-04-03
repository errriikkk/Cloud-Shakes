/**
 * Plugin Runtime - Entry Point
 * SDK completo para plugins Cloud Shakes
 * @version 1.0.0
 */

// Types
export {
  API_VERSION,
  CAPABILITY_RISK,
  CAPABILITY_DESCRIPTIONS,
  PluginRuntimeError,
} from './types.js';

export type {
  Capability,
  Runtime,
  PluginManifest,
  ConfigSchema,
  ConfigProperty,
  PluginStatus,
  PluginInstance,
  Hook,
  HookHandler,
  PluginContext,
  FilesAPI,
  UsersAPI,
  DBAPI,
  HTTPAPI,
  File,
  FileQuery,
  UploadData,
  PublicUser,
  UserQuery,
  FileWhere,
  UserWhere,
  RequestOpts,
  HttpResponse,
  ExecutionResult,
  LogEntry,
  ExecutionOptions,
  SandboxState,
  FileUploadInput,
  LoginEvent,
} from './types.js';

// Context
export { createPluginContext } from './context.js';

// Hooks
export {
  registerHook,
  executeHook,
  hasHandlers,
  getHandlerCount,
  clearHooks,
  getActiveHooks,
  onFileUploadBefore,
  onFileUploadAfter,
  onAuthLoginAfter,
  runFileUploadBefore,
  runFileUploadAfter,
  runAuthLoginAfter,
} from './hooks.js';

// Loader
export {
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
} from './loader.js';

// Lifecycle
export {
  install,
  enable,
  disable,
  uninstall,
  rollback,
  healthCheck,
  loadState,
} from './lifecycle.js';

// ─── PluginRuntime Class ───────────────────────────────────────────────────

import type { PluginManifest, PluginInstance, PluginContext, ExecutionResult } from './types.js';
import { PluginSandbox } from './sandbox.js';
import { createPluginContext } from './context.js';
import { loadPluginInstance, getActivePlugin } from './loader.js';
import { enable as lifecycleEnable, disable as lifecycleDisable, healthCheck } from './lifecycle.js';

interface RuntimeOptions {
  memoryLimitMB?: number;
  timeoutMs?: number;
  enableInspector?: boolean;
}

/**
 * Plugin Runtime - API principal
 */
export class PluginRuntime {
  private instances: Map<string, PluginSandbox> = new Map();
  private pluginCode: Map<string, string> = new Map();
  private options: RuntimeOptions;

  constructor(options: RuntimeOptions = {}) {
    this.options = {
      memoryLimitMB: 128,
      timeoutMs: 5000,
      enableInspector: false,
      ...options,
    };
  }

  /**
   * Activa y carga un plugin en el runtime
   */
  async activate(name: string, version?: string): Promise<{ success: boolean; error?: string }> {
    // Si no especifica versión, usar la activa
    if (!version) {
      const active = getActivePlugin(name);
      if (!active) {
        return { success: false, error: `No active version for ${name}` };
      }
      version = active.version;
    }

    // Enable en lifecycle
    const enableResult = lifecycleEnable(name, version);
    if (!enableResult.success) {
      return enableResult;
    }

    // Cargar instancia
    const instance = loadPluginInstance(name, version);
    if (!instance.success || !instance.instance) {
      return { success: false, error: instance.error };
    }

    // Crear sandbox
    const sandbox = new PluginSandbox(instance.instance.manifest, {
      memoryLimitMB: this.options.memoryLimitMB,
      timeoutMs: this.options.timeoutMs,
    });

    // Guardar código del plugin para ejecución posterior
    const code = require('fs').readFileSync(require('path').join(instance.instance.path, instance.instance.manifest.entryPoint), 'utf-8');
    this.pluginCode.set(name, code);

    // Guardar en registry
    this.instances.set(name, sandbox);

    return { success: true };
  }

  /**
   * Desactiva un plugin
   */
  deactivate(name: string): { success: boolean; error?: string } {
    // Dispose del sandbox
    const sandbox = this.instances.get(name);
    if (sandbox) {
      sandbox.dispose();
      this.instances.delete(name);
    }

    // Disable en lifecycle
    return lifecycleDisable(name);
  }

  /**
   * Ejecuta un plugin con input dado
   */
  async execute<T = unknown>(
    name: string,
    input: unknown
  ): Promise<ExecutionResult<T>> {
    const sandbox = this.instances.get(name);

    if (!sandbox) {
      return {
        success: false,
        error: `Plugin ${name} not activated`,
        logs: [],
        duration: 0,
        memoryUsed: 0,
      };
    }

    const code = this.pluginCode.get(name);
    if (!code) {
      return {
        success: false,
        error: `Plugin ${name} code not found`,
        logs: [],
        duration: 0,
        memoryUsed: 0,
      };
    }

    return sandbox.execute<T>(code, input);
  }

  /**
   * Verifica estado de salud de un plugin
   */
  checkHealth(name: string): { healthy: boolean; error?: string } {
    return healthCheck(name);
  }

  /**
   * Obtiene estadísticas de un plugin activo
   */
  getStats(name: string): {
    memoryUsed: number;
    memoryTotal: number;
    executionCount: number;
    httpCalls: number;
  } | null {
    const sandbox = this.instances.get(name);
    return sandbox ? sandbox.getStats() : null;
  }

  /**
   * Lista plugins activos
   */
  getActivePlugins(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Limpia todos los recursos
   */
  dispose(): void {
    for (const [name, sandbox] of this.instances) {
      try {
        sandbox.dispose();
      } catch (error) {
        console.error(`[Runtime] Failed to dispose ${name}:`, error);
      }
    }
    this.instances.clear();
  }
}

// ─── Default Export ────────────────────────────────────────────────────────

import { createSandbox, validateCapabilities } from './sandbox.js';
import { registerHook, executeHook, clearHooks, onFileUploadBefore, onFileUploadAfter, onAuthLoginAfter } from './hooks.js';
import { calculateChecksum, verifyIntegrity, loadManifest, getInstalledPlugins } from './loader.js';
import { install, uninstall, rollback } from './lifecycle.js';

export default {
  // Clase principal
  PluginRuntime,

  // Sandbox
  PluginSandbox,
  createSandbox,
  validateCapabilities,

  // Context
  createPluginContext,

  // Hooks
  registerHook,
  executeHook,
  clearHooks,
  onFileUploadBefore,
  onFileUploadAfter,
  onAuthLoginAfter,

  // Loader
  calculateChecksum,
  verifyIntegrity,
  loadManifest,
  getInstalledPlugins,

  // Lifecycle
  install,
  enable: lifecycleEnable,
  disable: lifecycleDisable,
  uninstall,
  rollback,
  healthCheck,
};
