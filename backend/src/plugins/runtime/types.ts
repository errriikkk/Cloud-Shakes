/**
 * Plugin Runtime Types
 * Contrato versionado para el ecosistema de plugins de Cloud Shakes
 * @version 1.0.0
 */

// API Version - Cambio breaking = major version bump
export const API_VERSION = '1.0' as const;

// Capabilities - Lista exhaustiva y estricta
export type Capability =
  | 'files.read'          // Leer archivos del usuario
  | 'files.write'         // Escribir archivos (crear/modificar)
  | 'files.delete'        // Eliminar archivos (riesgo alto)
  | 'users.read'          // Leer información pública de usuarios
  | 'user.email'          // Acceso a email (riesgo medio-alto)
  | 'db.read'             // Leer desde base de datos (queries predefinidas)
  | 'http.external'       // HTTP a servicios externos
  | 'webhook.receive'     // Recibir webhooks en endpoints propios
  | 'ui.inject';          // Inyectar componentes en el frontend

// Nivel de riesgo por capability (para UI de permisos)
export const CAPABILITY_RISK: Record<Capability, 'low' | 'medium' | 'high'> = {
  'files.read': 'low',
  'files.write': 'medium',
  'files.delete': 'high',
  'users.read': 'low',
  'user.email': 'medium',
  'db.read': 'low',
  'http.external': 'medium',
  'webhook.receive': 'medium',
  'ui.inject': 'low',
};

// Descripciones para UI
export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  'files.read': 'Read files from user storage',
  'files.write': 'Create and modify files',
  'files.delete': 'Delete files permanently',
  'users.read': 'Read public user profiles',
  'user.email': 'Access user email addresses',
  'db.read': 'Read data through predefined queries',
  'http.external': 'Make HTTP requests to external services',
  'webhook.receive': 'Receive webhook notifications',
  'ui.inject': 'Add UI components to the interface',
};

// Runtime soportados
export type Runtime = 'js' | 'node' | 'docker';

// Manifest del plugin - Contrato estricto
export interface PluginManifest {
  // Identidad
  name: string;           // kebab-case, único
  version: string;        // semver
  displayName: string;    // Nombre legible
  description?: string;   // Max 500 chars
  
  // Versionado del API
  apiVersion: typeof API_VERSION;
  
  // Capabilities declaradas
  capabilities: Capability[];
  
  // Runtime
  runtime: Runtime;
  entryPoint: string;     // Relativo a raíz del plugin
  
  // Límites
  memoryLimit: string;    // e.g., '128Mi', '256Mi', '512Mi'
  timeout: number;        // Segundos (default: 5)
  ioTimeout?: number;     // Segundos para I/O (default: 30)
  
  // Metadata
  author: string;
  website?: string;
  repository?: string;
  license?: string;
  iconUrl?: string;
  
  // Configuración por instancia
  configSchema?: ConfigSchema;
  
  // Verificación (runtime)
  checksum?: string;
  signature?: string;
}

// Schema de configuración (para validación)
export interface ConfigSchema {
  type: 'object';
  properties: Record<string, ConfigProperty>;
  required?: string[];
}

export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

// Estados del lifecycle
export type PluginStatus =
  | 'installed'    // Descargado y verificado, NO activo
  | 'enabled'      // Activo y ejecutándose
  | 'disabled'     // Detenido, config preservada
  | 'error'        // Falló al iniciar
  | 'uninstalled'; // Eliminado

// Instancia de plugin en el sistema
export interface PluginInstance {
  id: string;             // name@version
  name: string;
  version: string;
  status: PluginStatus;
  manifest: PluginManifest;
  config: Record<string, unknown>;
  capabilities: Capability[];
  
  // Paths
  path: string;         // Ruta absoluta al directorio
  entryPath: string;    // Ruta absoluta al entry point
  
  // Timestamps
  installedAt: number;
  enabledAt?: number;
  lastError?: string;
  lastErrorAt?: number;
}

// Hooks soportados (MVP - Solo 3)
export type Hook =
  | 'file.upload.before'   // Validar/transformar archivo antes de subir
  | 'file.upload.after'    // Procesar después de subir (thumbnails, scan)
  | 'auth.login.after';   // Acciones post-login (auditoría, notificaciones)

// Handler de hook
export type HookHandler<T = unknown, R = unknown> = (
  data: T,
  context: PluginContext
) => Promise<R> | R;

// Contexto expuesto a los plugins (API pública)
export interface PluginContext {
  // Identidad
  plugin: {
    id: string;
    name: string;
    version: string;
    capabilities: Capability[];
  };
  
  // Configuración de instancia
  config: Record<string, unknown>;
  
  // Logging (auditado)
  log: {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
  
  // Files API (requiere 'files.*' capabilities)
  files?: FilesAPI;
  
  // Users API (requiere 'users.read' capability)
  users?: UsersAPI;
  
  // DB API (requiere 'db.read' capability)
  db?: DBAPI;
  
  // HTTP API (requiere 'http.external' capability)
  http?: HTTPAPI;
}

// Files API
export interface FilesAPI {
  list(query: FileQuery): Promise<File[]>;
  get(id: string): Promise<File | null>;
  getByPath(path: string): Promise<File | null>;
  upload(data: UploadData): Promise<File>;
  delete(id: string): Promise<void>;
  
  // Streaming para archivos grandes
  createReadStream(id: string): Promise<ReadableStream>;
}

export interface File {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
}

export interface FileQuery {
  path?: string;
  ownerId?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'size' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

export interface UploadData {
  name: string;
  path: string;
  data: Buffer | ReadableStream;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

// Users API
export interface UsersAPI {
  getCurrent(): Promise<PublicUser | null>;
  list(query?: UserQuery): Promise<PublicUser[]>;
  getById(id: string): Promise<PublicUser | null>;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  // Email solo con 'user.email' capability
  email?: string;
  createdAt: string;
}

export interface UserQuery {
  limit?: number;
  offset?: number;
  search?: string;
}

// DB API - Queries predefinidas, NO raw SQL
export interface DBAPI {
  // Files table
  files: {
    findMany(where: FileWhere): Promise<File[]>;
    findUnique(id: string): Promise<File | null>;
    count(where?: FileWhere): Promise<number>;
  };
  
  // Users table (solo público)
  users: {
    findMany(where: UserWhere): Promise<PublicUser[]>;
    findUnique(id: string): Promise<PublicUser | null>;
    count(where?: UserWhere): Promise<number>;
  };
}

export interface FileWhere {
  id?: string;
  name?: { contains?: string; startsWith?: string; endsWith?: string };
  path?: { contains?: string; startsWith?: string; endsWith?: string };
  mimeType?: string;
  size?: { lt?: number; gt?: number; lte?: number; gte?: number };
  ownerId?: string;
  isPublic?: boolean;
  createdAt?: { lt?: Date; gt?: Date };
  AND?: FileWhere[];
  OR?: FileWhere[];
}

export interface UserWhere {
  id?: string;
  username?: { contains?: string; startsWith?: string };
  AND?: UserWhere[];
  OR?: UserWhere[];
}

// HTTP API
export interface HTTPAPI {
  get(url: string, opts?: RequestOpts): Promise<HttpResponse>;
  post(url: string, body: unknown, opts?: RequestOpts): Promise<HttpResponse>;
  put(url: string, body: unknown, opts?: RequestOpts): Promise<HttpResponse>;
  patch(url: string, body: unknown, opts?: RequestOpts): Promise<HttpResponse>;
  delete(url: string, opts?: RequestOpts): Promise<HttpResponse>;
}

export interface RequestOpts {
  headers?: Record<string, string>;
  timeout?: number;  // Override del timeout por request
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  json<T>(): Promise<T>;
}

// Resultado de ejecución
export interface ExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  logs: LogEntry[];
  duration: number;  // ms
  memoryUsed: number; // bytes
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// Errores específicos del runtime
export class PluginRuntimeError extends Error {
  constructor(
    message: string,
    public code: 
      | 'CAPABILITY_DENIED'
      | 'TIMEOUT'
      | 'MEMORY_LIMIT'
      | 'SANDBOX_ERROR'
      | 'HOOK_ERROR'
      | 'LIFECYCLE_ERROR'
      | 'INVALID_MANIFEST'
      | 'VERIFICATION_FAILED',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PluginRuntimeError';
  }
}

// Opciones de ejecución
export interface ExecutionOptions {
  timeout?: number;
  memoryLimit?: number;
  freeze?: boolean;  // Congelar contexto después de ejecución
}

// Hook interfaces
export interface FileUploadInput {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  data: Buffer | ReadableStream;
  metadata?: Record<string, unknown>;
  uploadedBy: string;
}

export interface LoginEvent {
  user: PublicUser;
  ip: string;
  userAgent: string;
  timestamp: string;
  method: 'password' | 'oauth' | 'apikey';
}

// Estado interno del sandbox
export interface SandboxState {
  isolate: unknown;  // ivm.Isolate (tipo opaco aquí)
  context: unknown;  // ivm.Context
  script?: unknown;  // ivm.Script
  createdAt: number;
  lastUsedAt: number;
  executionCount: number;
  memoryUsed: number;
}
