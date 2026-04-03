/**
 * Plugin Registry - Frontend
 * Sistema de registro de componentes de plugins
 * @version 1.0.0
 */

import type { ComponentType } from 'react';
import type { Slot, FrontendPluginManifest, FrontendPluginInstance, PluginComponentProps } from './types.js';

// Registry global de componentes
const componentRegistry: Map<string, Map<Slot, ComponentType<PluginComponentProps>>> = new Map();

// Registry de plugins
const pluginRegistry: Map<string, FrontendPluginInstance> = new Map();

// Listeners de cambios
const changeListeners: Set<() => void> = new Set();

/**
 * Registra un componente de plugin en un slot
 */
export function registerComponent(
  pluginName: string,
  slot: Slot,
  component: ComponentType<PluginComponentProps>
): () => void {
  if (!componentRegistry.has(pluginName)) {
    componentRegistry.set(pluginName, new Map());
  }

  const pluginComponents = componentRegistry.get(pluginName)!;
  pluginComponents.set(slot, component);

  // Notificar cambios
  notifyChange();

  // Return unregister function
  return () => {
    pluginComponents.delete(slot);
    if (pluginComponents.size === 0) {
      componentRegistry.delete(pluginName);
    }
    notifyChange();
  };
}

/**
 * Obtiene componentes registrados para un slot
 */
export function getComponentsForSlot(slot: Slot): Array<{ pluginName: string; component: ComponentType<PluginComponentProps> }> {
  const components: Array<{ pluginName: string; component: ComponentType<PluginComponentProps> }> = [];

  for (const [pluginName, slots] of componentRegistry) {
    const component = slots.get(slot);
    if (component) {
      components.push({ pluginName, component });
    }
  }

  return components;
}

/**
 * Obtiene todos los slots activos
 */
export function getActiveSlots(): Slot[] {
  const activeSlots = new Set<Slot>();

  for (const slots of componentRegistry.values()) {
    for (const slot of slots.keys()) {
      activeSlots.add(slot);
    }
  }

  return Array.from(activeSlots);
}

/**
 * Verifica si hay componentes en un slot
 */
export function hasComponents(slot: Slot): boolean {
  for (const slots of componentRegistry.values()) {
    if (slots.has(slot)) {
      return true;
    }
  }
  return false;
}

/**
 * Registra un plugin completo
 */
export function registerPlugin(
  manifest: FrontendPluginManifest,
  components: Partial<Record<Slot, ComponentType<PluginComponentProps>>>
): () => void {
  const unregisterFns: Array<() => void> = [];

  for (const [slot, component] of Object.entries(components)) {
    if (component && manifest.slots.includes(slot as Slot)) {
      unregisterFns.push(registerComponent(manifest.name, slot as Slot, component));
    }
  }

  // Guardar instancia
  const instance: FrontendPluginInstance = {
    id: `${manifest.name}@${manifest.version}`,
    name: manifest.name,
    version: manifest.version,
    manifest,
    components: new Map(Object.entries(components).filter(([k, v]) => v) as [Slot, ComponentType<any>][]),
    enabled: true,
  };

  pluginRegistry.set(manifest.name, instance);
  notifyChange();

  return () => {
    unregisterFns.forEach(fn => fn());
    pluginRegistry.delete(manifest.name);
    notifyChange();
  };
}

/**
 * Obtiene plugin registrado
 */
export function getPlugin(name: string): FrontendPluginInstance | undefined {
  return pluginRegistry.get(name);
}

/**
 * Lista plugins registrados
 */
export function getRegisteredPlugins(): FrontendPluginInstance[] {
  return Array.from(pluginRegistry.values());
}

/**
 * Habilita/deshabilita plugin
 */
export function setPluginEnabled(name: string, enabled: boolean): void {
  const plugin = pluginRegistry.get(name);
  if (plugin) {
    plugin.enabled = enabled;
    notifyChange();
  }
}

/**
 * Suscribe a cambios en el registry
 */
export function subscribeToChanges(callback: () => void): () => void {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

/**
 * Notifica cambios a los listeners
 */
function notifyChange(): void {
  changeListeners.forEach(cb => {
    try {
      cb();
    } catch (error) {
      console.error('[PluginRegistry] Change listener failed:', error);
    }
  });
}

/**
 * Limpia todo el registry
 */
export function clearRegistry(): void {
  componentRegistry.clear();
  pluginRegistry.clear();
  notifyChange();
}

// ─── Default Export ─────────────────────────────────────────────────────────

export default {
  registerComponent,
  getComponentsForSlot,
  hasComponents,
  getActiveSlots,
  registerPlugin,
  getPlugin,
  getRegisteredPlugins,
  setPluginEnabled,
  subscribeToChanges,
  clear: clearRegistry,
};
