/**
 * Plugin Sandbox Runtime - Implementación Mínima Segura
 * @version 1.0.0
 */

import ivm from 'isolated-vm';
import type { PluginManifest, ExecutionResult, LogEntry, Capability } from './types.js';

const DEFAULT_MEMORY_MB = 128;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BUNDLE_SIZE = 10 * 1024 * 1024;
const MAX_LOG_ENTRIES = 1000;

const FORBIDDEN_PATTERNS = [
  /require\s*\(/,
  /process\./,
  /child_process/,
  /fs\./,
  /eval\s*\(/,
  /Function\s*\(/,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
];

interface SandboxOptions {
  memoryLimitMB?: number;
  timeoutMs?: number;
  allowedDomains?: string[];
  rateLimit?: number;
  enableInspector?: boolean;
}

export class PluginSandbox {
  private isolate: ivm.Isolate;
  private manifest: PluginManifest;
  private options: SandboxOptions;
  private logs: LogEntry[] = [];
  private executionCount = 0;
  private httpCalls = 0;
  private lastHttpCall = 0;

  constructor(manifest: PluginManifest, options: SandboxOptions = {}) {
    this.manifest = manifest;
    this.options = {
      memoryLimitMB: DEFAULT_MEMORY_MB,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      allowedDomains: [],
      rateLimit: 100,
      ...options,
    };
    this.isolate = new ivm.Isolate({
      memoryLimit: this.options.memoryLimitMB,
      inspector: false,
    });
  }

  static validateCode(code: string, capabilities: Capability[]): { valid: boolean; error?: string } {
    if (code.length > MAX_BUNDLE_SIZE) {
      return { valid: false, error: `Bundle size exceeds ${MAX_BUNDLE_SIZE} bytes` };
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        return { valid: false, error: `Forbidden pattern detected` };
      }
    }
    if (!capabilities.includes('http.external')) {
      if (/fetch|axios|XMLHttpRequest/i.test(code)) {
        return { valid: false, error: 'HTTP usage without http.external capability' };
      }
    }
    return { valid: true };
  }

  async execute<T = unknown>(code: string, input?: unknown): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const pluginId = `${this.manifest.name}@${this.manifest.version}`;

    const validation = PluginSandbox.validateCode(code, this.manifest.capabilities);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.error}`, logs: [], duration: 0, memoryUsed: 0 };
    }

    const context = await this.isolate.createContext();
    const jail = context.global;

    try {
      await jail.set('global', jail.derefInto());
      const bridge = this.createBridge();
      await jail.set('__bridge', new ivm.Reference(bridge));
      await context.eval('Object.freeze(global.__bridge)');

      const wrappedCode = this.wrapCode(code, pluginId);
      const script = await this.isolate.compileScript(wrappedCode);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          this.isolate.dispose();
          reject(new Error(`Execution timeout after ${this.options.timeoutMs}ms`));
        }, this.options.timeoutMs);
      });

      const runPromise = script.run(context, { timeout: this.options.timeoutMs });
      await Promise.race([runPromise, timeoutPromise]);

      let output: T | undefined;
      try {
        const runRef = await jail.get('__run');
        if (runRef instanceof ivm.Reference && typeof runRef.deref() === 'function') {
          output = (await runRef.apply(undefined, [input], { 
            timeout: this.options.timeoutMs,
            arguments: { copy: true },
            result: { copy: true },
          })) as T;
        }
      } catch {}

      const endTime = Date.now();
      const heapStats = this.isolate.getHeapStatisticsSync();
      this.executionCount++;

      return { success: true, result: output, logs: [...this.logs], duration: endTime - startTime, memoryUsed: heapStats.used_heap_size };
    } catch (error) {
      const endTime = Date.now();
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', logs: [...this.logs], duration: endTime - startTime, memoryUsed: 0 };
    } finally {
      context.release?.();
    }
  }

  private createBridge() {
    return {
      log: (level: string, msg: string, meta?: Record<string, unknown>) => {
        if (this.logs.length >= MAX_LOG_ENTRIES) this.logs.shift();
        this.logs.push({ level: level as LogEntry['level'], message: msg, timestamp: Date.now(), meta });
      },
      httpRequest: async (params: { url: string; method?: string; headers?: Record<string, string>; body?: any }) => {
        if (!this.manifest.capabilities.includes('http.external')) {
          throw new Error('http.external capability not granted');
        }
        if (this.options.allowedDomains && this.options.allowedDomains.length > 0) {
          const url = new URL(params.url);
          const allowed = this.options.allowedDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
          if (!allowed) throw new Error(`Domain ${url.hostname} not in allowed list`);
        }
        const now = Date.now();
        if (now - this.lastHttpCall > 60000) this.httpCalls = 0;
        if (this.httpCalls >= (this.options.rateLimit || 100)) throw new Error('HTTP rate limit exceeded');
        this.httpCalls++;
        this.lastHttpCall = now;

        const response = await fetch(params.url, {
          method: params.method || 'GET',
          headers: params.headers,
          body: params.body ? JSON.stringify(params.body) : undefined,
        });
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
      },
    };
  }

  private wrapCode(userCode: string, pluginId: string): string {
    const pluginData = {
      id: pluginId,
      name: this.manifest.name,
      version: this.manifest.version,
      capabilities: this.manifest.capabilities,
    };
    
    return `
      (function() {
        "use strict";
        const bridge = global.__bridge;
        const log = {
          debug: (msg, meta) => bridge.log.applySync(undefined, ['debug', msg, meta]),
          info: (msg, meta) => bridge.log.applySync(undefined, ['info', msg, meta]),
          warn: (msg, meta) => bridge.log.applySync(undefined, ['warn', msg, meta]),
          error: (msg, meta) => bridge.log.applySync(undefined, ['error', msg, meta]),
        };
        const http = {
          request: async (params) => await bridge.httpRequest.apply(undefined, [params], { promise: true, result: { copy: true } }),
          get: (url, opts) => http.request({ ...opts, url, method: 'GET' }),
          post: (url, body, opts) => http.request({ ...opts, url, method: 'POST', body }),
        };
        const plugin = ${JSON.stringify(pluginData)};
        const require = undefined;
        const process = undefined;
        const globalThis = undefined;
        ${userCode}
        if (typeof run === 'function') global.__run = run;
      })()
    `;
  }

  getLogs(): LogEntry[] { return [...this.logs]; }
  dispose(): void { this.isolate.dispose(); this.logs = []; }
  getStats() {
    const heapStats = this.isolate.getHeapStatisticsSync();
    return { memoryUsed: heapStats.used_heap_size, memoryTotal: heapStats.total_heap_size, executionCount: this.executionCount, httpCalls: this.httpCalls };
  }
}

export function createSandbox(manifest: PluginManifest, options?: { memoryLimitMB?: number; timeoutMs?: number; allowedDomains?: string[] }): PluginSandbox {
  return new PluginSandbox(manifest, options);
}

export function validateCapabilities(declared: Capability[], code: string): { valid: boolean; missing: Capability[]; extra: Capability[] } {
  const patterns: Record<Capability, RegExp[]> = {
    'files.read': [/files\.get|files\.list|files\.read/i],
    'files.write': [/files\.upload|files\.write|files\.create/i],
    'files.delete': [/files\.delete|files\.remove/i],
    'users.read': [/users\.get|users\.list|users\.find/i],
    'user.email': [/user\.email|users\.email/i],
    'db.read': [/db\.files|db\.users|db\.query/i],
    'http.external': [/http\.request|http\.get|fetch|axios/i],
    'webhook.receive': [/webhook|onWebhook/i],
    'ui.inject': [/ui\.inject|registerComponent|addSlot/i],
  };
  const missing: Capability[] = [];
  const extra: Capability[] = [];
  for (const [cap, capPatterns] of Object.entries(patterns)) {
    if (capPatterns.some(p => p.test(code)) && !declared.includes(cap as Capability)) missing.push(cap as Capability);
  }
  for (const cap of declared) {
    if (!patterns[cap].some(p => p.test(code))) extra.push(cap);
  }
  return { valid: missing.length === 0, missing, extra };
}
