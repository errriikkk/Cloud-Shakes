/**
 * Plugin Route Registry
 * 
 * Permite a los plugins registrar sus propias rutas HTTP en el backend
 * durante el ciclo de vida onActivate. Las rutas quedan disponibles en:
 *   /api/plugins/p/{pluginName}/{ruta-del-plugin}
 * 
 * @version 1.0.0
 */

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';

interface RegisteredRoute {
  pluginName: string;
  method: string;
  path: string;
  registeredAt: number;
}

class PluginRouteRegistry {
  /** Router principal montado en /api/plugins/p */
  public readonly router: Router;

  /** Sub-routers por plugin, key = pluginName */
  private pluginRouters: Map<string, Router> = new Map();

  /** Registro de rutas para introspección / debug */
  private registeredRoutes: RegisteredRoute[] = [];

  constructor() {
    this.router = Router();
    // El router principal delega al sub-router de cada plugin por nombre
    this.router.use('/:pluginName', (req: Request, res: Response, next: NextFunction) => {
      const name = String(req.params.pluginName);
      const pluginRouter = this.pluginRouters.get(name);
      if (!pluginRouter) {
        return res.status(404).json({ error: `Plugin '${name}' has no registered routes` });
      }
      // Pasa el control al sub-router del plugin, que ve la ruta relativa
      pluginRouter(req, res, next);
    });
  }

  /**
   * Devuelve el objeto `api.routes` que se inyecta en el contexto del plugin.
   * El plugin llama api.routes.get('/chat', handler) y queda registrado
   * automáticamente bajo /api/plugins/p/{pluginName}/chat
   */
  public getApiForPlugin(pluginName: string): PluginRoutesAPI {
    return new PluginRoutesAPI(pluginName, this);
  }

  /**
   * Registra una ruta para un plugin. Llamado internamente por PluginRoutesAPI.
   */
  public register(
    pluginName: string,
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    handler: RequestHandler
  ): void {
    if (!this.pluginRouters.has(pluginName)) {
      this.pluginRouters.set(pluginName, Router());
    }
    const pluginRouter = this.pluginRouters.get(pluginName)!;
    pluginRouter[method](path, handler);

    this.registeredRoutes.push({
      pluginName,
      method: method.toUpperCase(),
      path: `/api/plugins/p/${pluginName}${path}`,
      registeredAt: Date.now(),
    });

    console.log(`[PluginRoute] Registered ${method.toUpperCase()} /api/plugins/p/${pluginName}${path}`);
  }

  /**
   * Elimina todas las rutas de un plugin (cuando se desactiva).
   */
  public unregister(pluginName: string): void {
    if (this.pluginRouters.has(pluginName)) {
      this.pluginRouters.delete(pluginName);
      this.registeredRoutes = this.registeredRoutes.filter(r => r.pluginName !== pluginName);
      console.log(`[PluginRoute] Unregistered all routes for plugin '${pluginName}'`);
    }
  }

  public listRoutes(): RegisteredRoute[] {
    return [...this.registeredRoutes];
  }
}

/**
 * API de rutas expuesta al plugin en su contexto.
 */
export class PluginRoutesAPI {
  constructor(
    private readonly pluginName: string,
    private readonly registry: PluginRouteRegistry
  ) {}

  get(path: string, handler: RequestHandler) {
    this.registry.register(this.pluginName, 'get', path, handler);
  }
  post(path: string, handler: RequestHandler) {
    this.registry.register(this.pluginName, 'post', path, handler);
  }
  put(path: string, handler: RequestHandler) {
    this.registry.register(this.pluginName, 'put', path, handler);
  }
  delete(path: string, handler: RequestHandler) {
    this.registry.register(this.pluginName, 'delete', path, handler);
  }
  patch(path: string, handler: RequestHandler) {
    this.registry.register(this.pluginName, 'patch', path, handler);
  }
}

// Singleton global compartido por todo el proceso
export const pluginRouteRegistry = new PluginRouteRegistry();
