/**
 * Plugin Sandbox Tests
 * Tests para el sistema de sandbox con isolated-vm
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginSandbox, validateCapabilities } from '../sandbox.js';
import type { PluginManifest, Capability } from '../types.js';

describe('PluginSandbox', () => {
  const baseManifest: PluginManifest = {
    name: 'test-plugin',
    version: '1.0.0',
    displayName: 'Test Plugin',
    apiVersion: '1.0',
    capabilities: ['http.external'],
    runtime: 'js',
    entryPoint: 'index.js',
    memoryLimit: '128Mi',
    timeout: 5,
    author: 'test',
  };

  let sandbox: PluginSandbox;

  afterEach(() => {
    if (sandbox) {
      sandbox.dispose();
    }
  });

  describe('Code Validation', () => {
    it('should reject code with require()', () => {
      const code = 'const fs = require("fs");';
      const result = PluginSandbox.validateCode(code, ['http.external']);
      expect(result.valid).toBe(false);
    });

    it('should reject code with process access', () => {
      const code = 'console.log(process.env.SECRET);';
      const result = PluginSandbox.validateCode(code, ['http.external']);
      expect(result.valid).toBe(false);
    });

    it('should reject code with eval()', () => {
      const code = 'eval("console.log(1)");';
      const result = PluginSandbox.validateCode(code, ['http.external']);
      expect(result.valid).toBe(false);
    });

    it('should reject code with new Function()', () => {
      const code = 'const fn = new Function("return 1");';
      const result = PluginSandbox.validateCode(code, ['http.external']);
      expect(result.valid).toBe(false);
    });

    it('should reject code that uses fetch without capability', () => {
      const code = 'fetch("https://example.com");';
      const result = PluginSandbox.validateCode(code, []);
      expect(result.valid).toBe(false);
    });

    it('should allow safe code', () => {
      const code = 'console.log("Hello");';
      const result = PluginSandbox.validateCode(code, []);
      expect(result.valid).toBe(true);
    });

    it('should reject code exceeding max bundle size', () => {
      const code = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const result = PluginSandbox.validateCode(code, []);
      expect(result.valid).toBe(false);
    });
  });

  describe('Execution', () => {
    it('should execute simple code', async () => {
      sandbox = new PluginSandbox(baseManifest);
      const code = 'log.info("Hello from plugin");';
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toBe('Hello from plugin');
    });

    it('should capture logs', async () => {
      sandbox = new PluginSandbox(baseManifest);
      const code = `
        log.debug('debug msg');
        log.info('info msg');
        log.warn('warn msg');
        log.error('error msg');
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(4);
      expect(result.logs.map(l => l.level)).toEqual(['debug', 'info', 'warn', 'error']);
    });

    it('should execute run function with input', async () => {
      sandbox = new PluginSandbox(baseManifest);
      const code = `
        async function run(input) {
          log.info('Received: ' + JSON.stringify(input));
          return { processed: input.value * 2 };
        }
      `;
      
      const result = await sandbox.execute(code, { value: 5 });
      
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ processed: 10 });
    });

    it('should handle errors gracefully', async () => {
      sandbox = new PluginSandbox(baseManifest);
      const code = 'throw new Error("Test error");';
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('should enforce timeout', async () => {
      sandbox = new PluginSandbox({ ...baseManifest, timeout: 1 });
      const code = 'while(true) {}'; // Infinite loop
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 10000);
  });

  describe('HTTP Capability', () => {
    it('should allow HTTP requests with capability', async () => {
      sandbox = new PluginSandbox(baseManifest);
      // Note: This test would need a mock server in practice
      const code = `
        async function run() {
          try {
            const response = await http.get('https://httpbin.org/get');
            return { status: response.status };
          } catch (e) {
            return { error: e.message };
          }
        }
      `;
      
      const result = await sandbox.execute(code);
      // Should either succeed or fail with network error, not capability error
      expect(result.error).not.toContain('capability');
    });

    it('should reject HTTP without capability', async () => {
      const manifestWithoutHttp: PluginManifest = {
        ...baseManifest,
        capabilities: [],
      };
      sandbox = new PluginSandbox(manifestWithoutHttp);
      
      const code = `
        async function run() {
          await http.get('https://example.com');
        }
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('capability');
    });
  });

  describe('Memory Limits', () => {
    it('should enforce memory limit', async () => {
      sandbox = new PluginSandbox({ ...baseManifest, memoryLimit: '32Mi' });
      const code = `
        const arr = [];
        for (let i = 0; i < 1000000; i++) {
          arr.push('x'.repeat(1000));
        }
      `;
      
      const result = await sandbox.execute(code);
      
      // Should fail with memory error
      expect(result.success).toBe(false);
    });
  });

  describe('Stats', () => {
    it('should track execution count', async () => {
      sandbox = new PluginSandbox(baseManifest);
      
      await sandbox.execute('log.info("1");');
      await sandbox.execute('log.info("2");');
      await sandbox.execute('log.info("3");');
      
      const stats = sandbox.getStats();
      expect(stats.executionCount).toBe(3);
    });

    it('should track memory usage', async () => {
      sandbox = new PluginSandbox(baseManifest);
      
      await sandbox.execute('log.info("test");');
      
      const stats = sandbox.getStats();
      expect(stats.memoryUsed).toBeGreaterThan(0);
    });
  });
});

describe('validateCapabilities', () => {
  it('should detect missing capabilities', () => {
    const declared: Capability[] = ['files.read'];
    const code = 'files.upload();';
    
    const result = validateCapabilities(declared, code);
    
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('files.write');
  });

  it('should detect unused capabilities', () => {
    const declared: Capability[] = ['files.read', 'http.external'];
    const code = 'files.list();';
    
    const result = validateCapabilities(declared, code);
    
    expect(result.valid).toBe(true);
    expect(result.extra).toContain('http.external');
  });

  it('should pass when all capabilities are declared and used', () => {
    const declared: Capability[] = ['files.read', 'files.write'];
    const code = 'files.list(); files.upload();';
    
    const result = validateCapabilities(declared, code);
    
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
