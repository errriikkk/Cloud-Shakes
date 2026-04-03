/**
 * usePlugins Hook - React hook para integrar plugins
 * @version 1.0.0
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FrontendPluginInstance, Slot } from '../types.js';
import { getRegisteredPlugins, subscribeToChanges, setPluginEnabled } from '../registry.js';

/**
 * Hook para obtener lista de plugins y controlarlos
 */
export function usePlugins() {
  const [plugins, setPlugins] = useState<FrontendPluginInstance[]>([]);

  useEffect(() => {
    // Cargar plugins iniciales
    setPlugins(getRegisteredPlugins());

    // Suscribirse a cambios
    const unsubscribe = subscribeToChanges(() => {
      setPlugins(getRegisteredPlugins());
    });

    return unsubscribe;
  }, []);

  const enablePlugin = useCallback((name: string) => {
    setPluginEnabled(name, true);
  }, []);

  const disablePlugin = useCallback((name: string) => {
    setPluginEnabled(name, false);
  }, []);

  return {
    plugins,
    enabledPlugins: plugins.filter(p => p.enabled),
    disabledPlugins: plugins.filter(p => !p.enabled),
    enablePlugin,
    disablePlugin,
  };
}

/**
 * Hook para verificar si hay plugins en un slot
 */
export function useHasPlugins(slot: Slot): boolean {
  const [hasPlugins, setHasPlugins] = useState(false);

  useEffect(() => {
    // Importar dinámicamente para evitar SSR issues
    import('../registry.js').then(({ hasComponents }) => {
      setHasPlugins(hasComponents(slot));

      const unsubscribe = subscribeToChanges(() => {
        setHasPlugins(hasComponents(slot));
      });

      return unsubscribe;
    });
  }, [slot]);

  return hasPlugins;
}

/**
 * Hook para cargar plugins dinámicamente desde el servidor
 */
export function usePluginLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlugin = useCallback(async (pluginUrl: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch del plugin bundle
      const response = await fetch(pluginUrl);
      if (!response.ok) {
        throw new Error(`Failed to load plugin: ${response.status}`);
      }

      const code = await response.text();

      // Validar básico
      if (!code.includes('export') && !code.includes('module.exports')) {
        throw new Error('Invalid plugin format');
      }

      // Ejecutar y obtener exports
      // NOTA: En producción usar dynamic imports con sandbox
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      
      const module = await import(/* webpackIgnore: true */ url);
      
      URL.revokeObjectURL(url);

      if (!module.default && !module.register) {
        throw new Error('Plugin must export default or register function');
      }

      return module.default || module.register;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loadPlugin, loading, error };
}

/**
 * Hook para APIs de plugin
 */
export function usePluginAPI() {
  const makeRequest = useCallback(async (
    endpoint: string,
    options?: RequestInit
  ) => {
    const response = await fetch(`/api/plugins${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }, []);

  const getInstalledPlugins = useCallback(() => {
    return makeRequest('/installed');
  }, [makeRequest]);

  const installPlugin = useCallback((name: string, version: string) => {
    return makeRequest('/install', {
      method: 'POST',
      body: JSON.stringify({ pluginName: name, version }),
    });
  }, [makeRequest]);

  const enablePlugin = useCallback((name: string, version: string) => {
    return makeRequest('/enable', {
      method: 'POST',
      body: JSON.stringify({ pluginName: name, version }),
    });
  }, [makeRequest]);

  const disablePlugin = useCallback((name: string) => {
    return makeRequest('/disable', {
      method: 'POST',
      body: JSON.stringify({ pluginName: name }),
    });
  }, [makeRequest]);

  return {
    getInstalledPlugins,
    installPlugin,
    enablePlugin,
    disablePlugin,
  };
}

// ─── Default Export ───────────────────────────────────────────────────────

export default {
  usePlugins,
  useHasPlugins,
  usePluginLoader,
  usePluginAPI,
};
