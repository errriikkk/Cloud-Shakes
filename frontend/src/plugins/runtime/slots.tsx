/**
 * Slot System - Componentes React para inyectar plugins
 * @version 1.0.0
 */

'use client';

import React, { Suspense, useEffect, useState } from 'react';
import type { Slot, PluginComponentProps } from './types.js';
import { getComponentsForSlot, subscribeToChanges } from './registry.js';

// Contexto para APIs y helpers
interface PluginSlotContextValue {
  files?: {
    list: (query?: { path?: string; limit?: number }) => Promise<any[]>;
    get: (id: string) => Promise<any | null>;
    upload: (file: any, path: string) => Promise<any>;
    delete: (id: string) => Promise<void>;
  };
  users?: {
    getCurrent: () => Promise<any | null>;
    list: () => Promise<any[]>;
  };
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  openModal: (content: React.ReactNode) => void;
  closeModal: () => void;
}

const PluginSlotContext = React.createContext<PluginSlotContextValue | null>(null);

export const usePluginSlot = () => {
  const context = React.useContext(PluginSlotContext);
  if (!context) {
    throw new Error('usePluginSlot must be used within PluginSlotProvider');
  }
  return context;
};

interface PluginSlotProviderProps {
  children: React.ReactNode;
  value: PluginSlotContextValue;
}

export function PluginSlotProvider({ children, value }: PluginSlotProviderProps) {
  return (
    <PluginSlotContext.Provider value={value}>
      {children}
    </PluginSlotContext.Provider>
  );
}

// ─── Slot Components ─────────────────────────────────────────────────────────

interface SlotProps {
  slot: Slot;
  fallback?: React.ReactNode;
  className?: string;
}

/**
 * Componente Slot - Renderiza componentes de plugins registrados
 */
export function PluginSlot({ slot, fallback = null, className }: SlotProps) {
  const [components, setComponents] = useState<Array<{ pluginName: string; component: React.ComponentType<PluginComponentProps> }>>([]);
  const context = usePluginSlot();

  useEffect(() => {
    // Cargar componentes iniciales
    setComponents(getComponentsForSlot(slot));

    // Suscribirse a cambios
    const unsubscribe = subscribeToChanges(() => {
      setComponents(getComponentsForSlot(slot));
    });

    return unsubscribe;
  }, [slot]);

  if (components.length === 0) {
    return fallback;
  }

  return (
    <div className={className} data-plugin-slot={slot}>
      {components.map(({ pluginName, component: Component }) => (
        <ErrorBoundary key={pluginName} pluginName={pluginName}>
          <Suspense fallback={<PluginLoading pluginName={pluginName} />}>
            <Component
              pluginId={pluginName}
              files={context.files}
              users={context.users}
              showToast={context.showToast}
              openModal={context.openModal}
              closeModal={context.closeModal}
            />
          </Suspense>
        </ErrorBoundary>
      ))}
    </div>
  );
}

/**
 * Slot Sidebar - Panel lateral
 */
export function PluginSidebar({ className }: { className?: string }) {
  return (
    <PluginSlot
      slot="sidebar"
      className={className}
      fallback={null}
    />
  );
}

/**
 * Slot Toolbar - Barra de herramientas
 */
export function PluginToolbar({ className }: { className?: string }) {
  return (
    <PluginSlot
      slot="toolbar"
      className={className}
      fallback={null}
    />
  );
}

/**
 * Slot FileContextMenu - Menú contextual de archivos
 */
export function PluginFileContextMenu({ className }: { className?: string }) {
  return (
    <PluginSlot
      slot="file-context-menu"
      className={className}
      fallback={null}
    />
  );
}

// ─── Error Boundary ─────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  pluginName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[Plugin Error] ${this.props.pluginName}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">
            Plugin <strong>{this.props.pluginName}</strong> crashed
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Loading Component ──────────────────────────────────────────────────────

function PluginLoading({ pluginName }: { pluginName: string }) {
  return (
    <div className="p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="mt-2 text-xs text-gray-400">Loading {pluginName}...</div>
    </div>
  );
}

// ─── Hook para slots ─────────────────────────────────────────────────────

/**
 * Hook para obtener componentes de un slot
 */
export function usePluginSlotComponents(slot: Slot) {
  const [components, setComponents] = useState<Array<{ pluginName: string; component: React.ComponentType<PluginComponentProps> }>>([]);

  useEffect(() => {
    setComponents(getComponentsForSlot(slot));

    const unsubscribe = subscribeToChanges(() => {
      setComponents(getComponentsForSlot(slot));
    });

    return unsubscribe;
  }, [slot]);

  return components;
}

// ─── Default Export ────────────────────────────────────────────────────────

export default {
  PluginSlot,
  PluginSidebar,
  PluginToolbar,
  PluginFileContextMenu,
  PluginSlotProvider,
  usePluginSlot,
  usePluginSlotComponents,
};
