/**
 * Shakes SDK Host-Level Shim
 * 
 * Este archivo permite al backend (fuera del sandbox) cargar plugins que
 * dependen de '@shakes/sdk' sin necesidad de instalar el paquete real.
 * Es crucial para renderizar UI Slots (sidebar, pages) de forma rápida.
 */

import Module from 'module';

export class ShakesPlugin {
  static readonly isShakesPlugin = true;
  public readonly isShakesPlugin = true;
  public manifest: any = { entryPoint: 'index.js' };
  public _slots: Record<string, Function> = {};
  public _hooks: Record<string, Function> = {};

  constructor(public readonly name: string) {
    this.manifest.name = name;
  }

  setDisplayName(name: string) { this.manifest.displayName = name; return this; }
  setDescription(desc: string) { this.manifest.description = desc; return this; }
  setVersion(version: string) { this.manifest.version = version; return this; }
  registerSidebarWidget(factory: any) { this._slots['sidebar'] = factory; return this; }
  registerPage(factory: any) { this._slots['page'] = factory; return this; }
  onActivate(handler: any) { this._hooks['onActivate'] = handler; return this; }
  onExecute(handler: any) { this._hooks['execute'] = handler; return this; }

  export() {
    return {
      manifest: this.manifest,
      slots: this._slots,
      hooks: this._hooks,
      default: async (context: any, api: any, input?: any) => {
        if (this._hooks['execute']) return this._hooks['execute'](context, api, input);
      }
    };
  }
}

// @ts-ignore - Patching node require for the host process
const originalRequire = Module.prototype.require;

Module.prototype.require = function(this: any, id: string) {
  if (id === '@shakes/sdk') {
    return { ShakesPlugin };
  }
  return originalRequire.apply(this, [id]);
};

console.log('✅ Shakes SDK Shim registered in host process');
