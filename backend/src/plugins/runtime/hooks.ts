/**
 * Plugin Hooks System
 * Solo 3 hooks MVP - Complejidad exponencial por hook añadido
 * @version 1.0.0
 */

import type { Hook, HookHandler, PluginContext, File, PublicUser } from './types.js';

// Registry de handlers por hook
const hookRegistry: Map<Hook, Set<HookHandler>> = new Map();

/**
 * Registra un handler para un hook
 */
export function registerHook<T = unknown, R = unknown>(
  hook: Hook,
  handler: HookHandler<T, R>
): () => void {
  if (!hookRegistry.has(hook)) {
    hookRegistry.set(hook, new Set());
  }

  const handlers = hookRegistry.get(hook)!;
  handlers.add(handler as HookHandler);

  // Return unregister function
  return () => {
    handlers.delete(handler as HookHandler);
  };
}

/**
 * Ejecuta todos los handlers registrados para un hook
 * Para hooks 'before', el primer handler que retorne false corta la cadena
 * Para hooks 'after', se ejecutan todos secuencialmente
 */
export async function executeHook<T = unknown, R = unknown>(
  hook: Hook,
  data: T,
  context: PluginContext
): Promise<{ success: boolean; result?: R; stoppedAt?: number }> {
  const handlers = hookRegistry.get(hook);

  if (!handlers || handlers.size === 0) {
    return { success: true };
  }

  let currentData: T | R = data;
  let index = 0;

  for (const handler of handlers) {
    try {
      const result = await handler(currentData, context);

      // Para hooks 'before', si retorna false, cancelamos la operación
      if (hook.endsWith('.before') && result === false) {
        return { success: false, stoppedAt: index };
      }

      // El resultado se convierte en input para el siguiente handler
      currentData = result as T;
      index++;
    } catch (error) {
      console.error(`[Hook ${hook}] Handler ${index} failed:`, error);
      return { success: false, stoppedAt: index };
    }
  }

  return { success: true, result: currentData as unknown as R };
}

/**
 * Verifica si hay handlers registrados para un hook
 */
export function hasHandlers(hook: Hook): boolean {
  const handlers = hookRegistry.get(hook);
  return !!handlers && handlers.size > 0;
}

/**
 * Obtiene el número de handlers para un hook
 */
export function getHandlerCount(hook: Hook): number {
  const handlers = hookRegistry.get(hook);
  return handlers?.size || 0;
}

/**
 * Limpia todos los handlers (útil para testing)
 */
export function clearHooks(): void {
  hookRegistry.clear();
}

/**
 * Obtiene la lista de hooks activos
 */
export function getActiveHooks(): Hook[] {
  return Array.from(hookRegistry.keys()).filter(hook => {
    const handlers = hookRegistry.get(hook);
    return !!handlers && handlers.size > 0;
  });
}

// ─── Hook Implementations ──────────────────────────────────────────────────

/**
 * Hook: file.upload.before
 * Permite validar o transformar archivos antes de subirlos
 * 
 * Handlers reciben: FileUploadInput
 * Deben retornar: FileUploadInput | false (para cancelar)
 */
export interface FileUploadInput {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  data: Buffer | ReadableStream;
  metadata?: Record<string, unknown>;
  uploadedBy: string;
}

export function onFileUploadBefore(
  handler: HookHandler<FileUploadInput, FileUploadInput | false>
): () => void {
  return registerHook('file.upload.before', handler);
}

/**
 * Hook: file.upload.after
 * Permite procesar archivos después de subirlos
 * 
 * Handlers reciben: File (el archivo ya creado)
 * Pueden realizar: thumbnails, virus scan, indexación, etc.
 */
export function onFileUploadAfter(
  handler: HookHandler<File, File>
): () => void {
  return registerHook('file.upload.after', handler);
}

/**
 * Hook: auth.login.after
 * Permite acciones post-login
 * 
 * Handlers reciben: LoginEvent
 * Pueden realizar: auditoría, notificaciones, sincronización, etc.
 */
export interface LoginEvent {
  user: PublicUser;
  ip: string;
  userAgent: string;
  timestamp: string;
  method: 'password' | 'oauth' | 'apikey';
}

export function onAuthLoginAfter(
  handler: HookHandler<LoginEvent, void>
): () => void {
  return registerHook('auth.login.after', handler);
}

// ─── Execution Helpers ─────────────────────────────────────────────────────

/**
 * Ejecuta hook file.upload.before
 */
export async function runFileUploadBefore(
  input: FileUploadInput,
  context: PluginContext
): Promise<{ allowed: boolean; data?: FileUploadInput; error?: string }> {
  const result = await executeHook<FileUploadInput, FileUploadInput | false>(
    'file.upload.before',
    input,
    context
  );

  if (!result.success) {
    return {
      allowed: false,
      error: `Upload blocked by hook handler ${result.stoppedAt}`,
    };
  }

  return {
    allowed: result.result !== false,
    data: result.result === false ? undefined : (result.result as FileUploadInput),
  };
}

/**
 * Ejecuta hook file.upload.after
 */
export async function runFileUploadAfter(
  file: File,
  context: PluginContext
): Promise<{ success: boolean; error?: string }> {
  const result = await executeHook<File, File>('file.upload.after', file, context);

  return {
    success: result.success,
    error: result.success ? undefined : `Handler ${result.stoppedAt} failed`,
  };
}

/**
 * Ejecuta hook auth.login.after
 */
export async function runAuthLoginAfter(
  event: LoginEvent,
  context: PluginContext
): Promise<void> {
  // Fire-and-forget, no bloqueamos el login
  executeHook<LoginEvent, void>('auth.login.after', event, context).catch(error => {
    console.error('[Hook auth.login.after] Failed:', error);
  });
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default {
  register: registerHook,
  execute: executeHook,
  hasHandlers,
  getHandlerCount,
  clear: clearHooks,
  getActive: getActiveHooks,

  // Specific hooks
  onFileUploadBefore,
  onFileUploadAfter,
  onAuthLoginAfter,

  // Execution helpers
  runFileUploadBefore,
  runFileUploadAfter,
  runAuthLoginAfter,
};
