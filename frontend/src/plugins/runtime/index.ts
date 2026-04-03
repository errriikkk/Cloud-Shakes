/**
 * Plugin Runtime - Frontend Entry Point
 * @version 1.0.0
 */

// Types
export type {
  Slot,
  FrontendCapability,
  FrontendPluginManifest,
  FrontendPluginInstance,
  PluginComponentProps,
  FilesAPI,
  File,
  UsersAPI,
  PublicUser,
  ComponentRegistry,
  RuntimeState,
  PluginEvent,
  PluginEventHandler,
} from './types.js';

// Registry
export {
  registerComponent,
  getComponentsForSlot,
  hasComponents,
  getActiveSlots,
  registerPlugin,
  getPlugin,
  getRegisteredPlugins,
  setPluginEnabled,
  subscribeToChanges,
} from './registry.js';

// Slots
export {
  PluginSlot,
  PluginSidebar,
  PluginToolbar,
  PluginFileContextMenu,
  PluginSlotProvider,
  usePluginSlot,
  usePluginSlotComponents,
} from './slots.js';

// Hooks
export {
  usePlugins,
  useHasPlugins,
  usePluginLoader,
  usePluginAPI,
} from './hooks/usePlugins.js';

import {
  registerComponent,
  registerPlugin,
  getRegisteredPlugins,
  subscribeToChanges,
} from './registry.js';

import {
  PluginSlot,
  PluginSidebar,
  PluginToolbar,
  PluginFileContextMenu,
  PluginSlotProvider,
  usePluginSlot,
} from './slots.js';

// ─── Default Export ───────────────────────────────────────────────────────

export default {
  // Registry
  registerComponent,
  registerPlugin,
  getRegisteredPlugins,
  subscribeToChanges,

  // Slots
  PluginSlot,
  PluginSidebar,
  PluginToolbar,
  PluginFileContextMenu,
  PluginSlotProvider,
  usePluginSlot,
};
