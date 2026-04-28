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

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(?:require\s*\(\s*['"]child_process['"]\s*\)|\bchild_process\b)/,
    reason: 'child_process access is not allowed',
  },
  {
    pattern: /\b(?:require\s*\(\s*['"]fs['"]\s*\)|\bfs\.)/,
    reason: 'filesystem access is not allowed',
  },
  {
    pattern: /\beval\s*\(/,
    reason: 'eval is not allowed',
  },
  {
    pattern: /\bprocess\s*\.\s*(?:binding|mainModule|dlopen|_linkedBinding)\b/,
    reason: 'dangerous process internals are not allowed',
  },
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
    for (const item of FORBIDDEN_PATTERNS) {
      if (item.pattern.test(code)) {
        return { valid: false, error: `Forbidden pattern detected: ${item.reason}` };
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

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await jail.set('global', jail.derefInto());
      const bridge = this.createBridge();
      await jail.set('__bridge', new ivm.Reference(bridge));
      await context.eval('Object.freeze(global.__bridge)');

      const wrappedCode = this.wrapCode(code, pluginId);
      const script = await this.isolate.compileScript(wrappedCode);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          try {
            this.isolate.dispose();
          } catch {
            // Isolate can already be disposed by normal lifecycle/cleanup.
          }
          reject(new Error(`Execution timeout after ${this.options.timeoutMs}ms`));
        }, this.options.timeoutMs);
      });

      const runPromise = script.run(context, { timeout: this.options.timeoutMs });
      await Promise.race([runPromise, timeoutPromise]);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

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
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
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
        const module = { exports: {} };
        const exports = module.exports;
        const context = { 
          plugin: { name: plugin.name }, 
          config: {},
          log: (level, msg) => console.log(\`[PluginSandbox:\${plugin.name}] \${level}: \${msg}\`)
        };
        const api = {
          http,
          files: {
            list: async () => [],
            get: async () => null,
          },
        };
        class __SandboxEventEmitter {
          on() { return this; }
          once() { return this; }
          emit() { return false; }
          off() { return this; }
          removeListener() { return this; }
          removeAllListeners() { return this; }
        }
        class __SandboxReadable extends __SandboxEventEmitter {
          pipe() { return this; }
        }
        class __SandboxWritable extends __SandboxEventEmitter {
          write() { return true; }
          end() { return undefined; }
        }
        class __SandboxTransform extends __SandboxReadable {}
        class __SandboxPassThrough extends __SandboxTransform {}
        class __SandboxTextEncoder {
          encode(input = '') {
            const str = String(input);
            const out = [];
            for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
            return out;
          }
        }
        class __SandboxTextDecoder {
          decode(input = []) {
            if (!input || typeof input.length !== 'number') return '';
            let s = '';
            for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i] & 0xff);
            return s;
          }
        }
        class ShakesPlugin {
          constructor(name) {
            this.name = name;
            this.manifest = { name };
            this._slots = {};
            this._hooks = {};
          }
          setDisplayName(n) { this.manifest.displayName = n; return this; }
          setDescription(d) { this.manifest.description = d; return this; }
          setVersion(v) { this.manifest.version = v; return this; }
          registerSidebarWidget(f) { this._slots['sidebar'] = f; return this; }
          registerPage(f) { this._slots['page'] = f; return this; }
          onActivate(h) { this._hooks['onActivate'] = h; return this; }
          onExecute(h) { this._hooks['execute'] = h; return this; }
          export() {
            return {
              manifest: this.manifest,
              slots: this._slots,
              hooks: this._hooks,
              default: async (ctx, a, i) => {
                if (this._hooks['execute']) return await this._hooks['execute'](ctx, a, i);
              }
            };
          }
        }
        ShakesPlugin.isShakesPlugin = true;

        const __sandboxModules = {
          '@cloud-shakes/sdk': { ShakesPlugin },
          '@shakes/sdk': { ShakesPlugin },
          stream: {
            Readable: __SandboxReadable,
            Writable: __SandboxWritable,
            Transform: __SandboxTransform,
            PassThrough: __SandboxPassThrough,
          },
          events: { EventEmitter: __SandboxEventEmitter },
          util: {
            inherits: () => undefined,
            inspect: (v) => {
              try { return JSON.stringify(v); } catch { return String(v); }
            },
            format: (...args) => args.map((a) => String(a)).join(' '),
            TextEncoder: __SandboxTextEncoder,
            TextDecoder: __SandboxTextDecoder,
          },
          buffer: {
            Buffer: {
              from: (v) => (typeof v === 'string' ? v : ''),
              isBuffer: () => false,
            },
          },
        };
        const require = (moduleName) => {
          const name = String(moduleName || '');
          if (Object.prototype.hasOwnProperty.call(__sandboxModules, name)) {
            return __sandboxModules[name];
          }
          throw new Error('require is not available in plugin sandbox: ' + name);
        };
        const TextEncoder = __SandboxTextEncoder;
        const TextDecoder = __SandboxTextDecoder;
        const process = Object.freeze({
          env: Object.freeze({
            NODE_ENV: 'production'
          })
        });
        const globalThis = undefined;
        ${userCode}
        if (typeof run === 'function') {
          global.__run = run;
        } else if (module && module.exports) {
          const exp = module.exports;
          if (typeof exp === 'function') {
            global.__run = async (input) => exp(context, api, input);
          } else if (typeof exp === 'object' && exp.default && typeof exp.default === 'function') {
            global.__run = async (input) => exp.default(context, api, input);
          } else if (exp && exp.isShakesPlugin) {
            // Support both Class and Instance
            let exported;
            if (typeof exp === 'function') {
              const instance = new exp(plugin.name);
              exported = instance.export();
            } else {
              exported = exp.export();
            }
            
            // Register slots in the global scope if needed for the runtime to pick up
            global.__pluginSlots = exported.slots;
            
            // Use the instance's activate hook if available
            if (exported.hooks && exported.hooks.onActivate) {
              global.__run = async (input) => {
                if (input && input.type === 'lifecycle' && input.hook === 'onActivate') {
                  return await exported.hooks.onActivate(context, api);
                }
                return await exported.default(context, api, input);
              };
            } else {
              global.__run = async (input) => await exported.default(context, api, input);
            }
          }
        }
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
