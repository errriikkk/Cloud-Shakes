import { Request } from 'express';

// Tipos seguros para la aplicación
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    isAdmin: boolean;
    createdAt: Date;
  };
}

export interface FileItem {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  path: string;
  folderId?: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  isEmbed?: boolean;
  hideFromRecent?: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkItem {
  id: string;
  fileId: string;
  token: string;
  password?: string | null;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
  downloadCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  file?: FileItem;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UploadProgress {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'creating_folders';
  error?: string;
  path?: string;
}

// Tipos para búsqueda
export interface SearchResult {
  files: FileItem[];
  folders: FolderItem[];
  total: number;
}

// Tipos para estadísticas
export interface UserStats {
  totalFiles: number;
  totalSize: number;
  totalFolders: number;
  totalLinks: number;
  recentActivity: Array<{
    type: 'file' | 'folder' | 'link';
    action: 'create' | 'delete' | 'update';
    itemName: string;
    timestamp: Date;
  }>;
}

// Tipos para configuración
export interface ServerConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
  storageLimit: number;
  enableRegistration: boolean;
  enableFileSharing: boolean;
  defaultLanguage: string;
  supportedLanguages: string[];
}

// Enums para tipos de datos
export enum FileStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
  QUARANTINE = 'quarantine'
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum LinkStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DISABLED = 'disabled'
}

// Tipos para errores
export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Tipos para middleware
export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}
