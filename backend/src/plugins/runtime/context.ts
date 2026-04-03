/**
 * Plugin Context Implementation
 * API filtrada por capabilities con audit logging
 * @version 1.0.0
 */

import prisma from '../../config/db.js';
import {
  Capability,
  PluginContext,
  PluginManifest,
  PluginRuntimeError,
  FilesAPI,
  UsersAPI,
  DBAPI,
  HTTPAPI,
  File,
  PublicUser,
  FileQuery,
  UploadData,
  FileWhere,
  UserWhere,
  RequestOpts,
  HttpResponse,
  UserQuery,
} from './types.js';

// Configuracion
const HTTP_TIMEOUT_DEFAULT = 30000;

export function createPluginContext(
  manifest: PluginManifest,
  config: Record<string, unknown>
): PluginContext {
  const capabilities = new Set(manifest.capabilities);
  const pluginId = `${manifest.name}@${manifest.version}`;

  return {
    plugin: {
      id: pluginId,
      name: manifest.name,
      version: manifest.version,
      capabilities: manifest.capabilities,
    },
    config,
    log: createLogAPI(pluginId),
    files: hasAnyCapability(capabilities, ['files.read', 'files.write', 'files.delete'])
      ? createFilesAPI(capabilities, pluginId)
      : undefined,
    users: capabilities.has('users.read')
      ? createUsersAPI(capabilities, pluginId)
      : undefined,
    db: capabilities.has('db.read')
      ? createDBAPI(capabilities, pluginId)
      : undefined,
    http: capabilities.has('http.external')
      ? createHTTPAPI(pluginId)
      : undefined,
  };
}

function hasAnyCapability(capabilities: Set<Capability>, caps: Capability[]): boolean {
  return caps.some(c => capabilities.has(c));
}

function createLogAPI(pluginId: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      console.debug(`[Plugin ${pluginId}] ${msg}`, meta);
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      console.log(`[Plugin ${pluginId}] ${msg}`, meta);
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      console.warn(`[Plugin ${pluginId}] ${msg}`, meta);
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      console.error(`[Plugin ${pluginId}] ${msg}`, meta);
    },
  };
}

function createFilesAPI(capabilities: Set<Capability>, pluginId: string): FilesAPI {
  const checkCapability = (cap: Capability) => {
    if (!capabilities.has(cap)) {
      throw new PluginRuntimeError(`Capability '${cap}' not granted`, 'CAPABILITY_DENIED');
    }
  };

  return {
    async list(query: FileQuery): Promise<File[]> {
      checkCapability('files.read');
      return [];
    },
    async get(id: string): Promise<File | null> {
      checkCapability('files.read');
      return null;
    },
    async getByPath(path: string): Promise<File | null> {
      checkCapability('files.read');
      return null;
    },
    async upload(data: UploadData): Promise<File> {
      checkCapability('files.write');
      throw new PluginRuntimeError('Upload not implemented', 'SANDBOX_ERROR');
    },
    async delete(id: string): Promise<void> {
      checkCapability('files.delete');
      throw new PluginRuntimeError('Delete not implemented', 'SANDBOX_ERROR');
    },
    async createReadStream(id: string): Promise<ReadableStream> {
      checkCapability('files.read');
      throw new PluginRuntimeError('Streaming not implemented', 'SANDBOX_ERROR');
    },
  };
}

function createUsersAPI(capabilities: Set<Capability>, pluginId: string): UsersAPI {
  const checkCapability = (cap: Capability) => {
    if (!capabilities.has(cap)) {
      throw new PluginRuntimeError(`Capability '${cap}' not granted`, 'CAPABILITY_DENIED');
    }
  };

  return {
    async getCurrent(): Promise<PublicUser | null> {
      checkCapability('users.read');
      return null;
    },
    async list(query?: UserQuery): Promise<PublicUser[]> {
      checkCapability('users.read');
      return [];
    },
    async getById(id: string): Promise<PublicUser | null> {
      checkCapability('users.read');
      return null;
    },
  };
}

function createDBAPI(capabilities: Set<Capability>, pluginId: string): DBAPI {
  const checkCapability = (cap: Capability) => {
    if (!capabilities.has(cap)) {
      throw new PluginRuntimeError(`Capability '${cap}' not granted`, 'CAPABILITY_DENIED');
    }
  };

  return {
    files: {
      async findMany(where: FileWhere): Promise<File[]> {
        checkCapability('db.read');
        return [];
      },
      async findUnique(id: string): Promise<File | null> {
        checkCapability('db.read');
        return null;
      },
      async count(where?: FileWhere): Promise<number> {
        checkCapability('db.read');
        return 0;
      },
    },
    users: {
      async findMany(where: UserWhere): Promise<PublicUser[]> {
        checkCapability('db.read');
        return [];
      },
      async findUnique(id: string): Promise<PublicUser | null> {
        checkCapability('db.read');
        return null;
      },
      async count(where?: UserWhere): Promise<number> {
        checkCapability('db.read');
        return 0;
      },
    },
  };
}

function createHTTPAPI(pluginId: string): HTTPAPI {
  const makeRequest = async (
    method: string,
    url: string,
    body?: unknown,
    opts?: RequestOpts
  ): Promise<HttpResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeout || HTTP_TIMEOUT_DEFAULT);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Cloud-Shakes-Plugin/${pluginId}`,
          ...opts?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseBody = await response.text();

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        json: async <T>() => JSON.parse(responseBody) as T,
      };
    } catch (error) {
      clearTimeout(timeout);
      throw new PluginRuntimeError(
        `HTTP ${method} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SANDBOX_ERROR'
      );
    }
  };

  return {
    get: (url, opts) => makeRequest('GET', url, undefined, opts),
    post: (url, body, opts) => makeRequest('POST', url, body, opts),
    put: (url, body, opts) => makeRequest('PUT', url, body, opts),
    patch: (url, body, opts) => makeRequest('PATCH', url, body, opts),
    delete: (url, opts) => makeRequest('DELETE', url, undefined, opts),
  };
}
