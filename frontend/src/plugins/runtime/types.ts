/**
 * Plugin Runtime Types - Frontend
 * @version 1.0.0
 */

import type { ReactNode, ComponentType } from 'react';

// Slots soportados (MVP - 3 slots)
export type Slot = 'sidebar' | 'toolbar' | 'file-context-menu';

// Capabilities frontend
export type FrontendCapability = 'ui.inject' | 'files.read' | 'users.read';

// Manifest del plugin frontend
export interface FrontendPluginManifest {
  name: string;
  version: string;
  displayName: string;
  description?: string;
  apiVersion: '1.0';
  capabilities: FrontendCapability[];
  slots: Slot[];
  entryPoint: string;
  author: string;
  iconUrl?: string;
}

// Instancia de plugin frontend
export interface FrontendPluginInstance {
  id: string;
  name: string;
  version: string;
  manifest: FrontendPluginManifest;
  components: Map<Slot, ComponentType<any>>;
  enabled: boolean;
}

// Props base para componentes de plugins
export interface PluginComponentProps {
  pluginId: string;
  // API del contexto
  files?: FilesAPI;
  users?: UsersAPI;
  // Helpers
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  openModal: (content: ReactNode) => void;
  closeModal: () => void;
}

// API de archivos (limitada)
export interface FilesAPI {
  list: (query?: { path?: string; limit?: number }) => Promise<File[]>;
  get: (id: string) => Promise<File | null>;
  upload: (file: File, path: string) => Promise<File>;
  delete: (id: string) => Promise<void>;
}

export interface File {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

// API de usuarios (limitada)
export interface UsersAPI {
  getCurrent: () => Promise<PublicUser | null>;
  list: () => Promise<PublicUser[]>;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
}

// Registro de componentes
export type ComponentRegistry = Map<string, Map<Slot, ComponentType<any>>>;

// Estado del runtime
export interface RuntimeState {
  plugins: Map<string, FrontendPluginInstance>;
  components: ComponentRegistry;
  activeSlots: Map<Slot, boolean>;
}

// Eventos
export interface PluginEvent {
  type: 'file.select' | 'file.upload' | 'user.login' | 'user.logout';
  payload: unknown;
  timestamp: number;
}

export type PluginEventHandler = (event: PluginEvent) => void | Promise<void>;
