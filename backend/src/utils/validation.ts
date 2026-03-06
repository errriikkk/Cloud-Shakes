import { z } from 'zod';

// Esquemas de validación con Zod para seguridad
export const authSchemas = {
  register: z.object({
    username: z.string()
      .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
      .max(30, 'El nombre de usuario no puede exceder 30 caracteres')
      .regex(/^[a-zA-Z0-9_]+$/, 'Solo se permiten letras, números y guiones bajos'),
    email: z.string()
      .email('Email inválido')
      .max(255, 'El email no puede exceder 255 caracteres'),
    password: z.string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .max(128, 'La contraseña no puede exceder 128 caracteres')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
        'La contraseña debe contener mayúsculas, minúsculas, números y caracteres especiales'),
    displayName: z.string()
      .min(1, 'El nombre es requerido')
      .max(50, 'El nombre no puede exceder 50 caracteres')
      .optional()
  }),

  login: z.object({
    username: z.string()
      .min(1, 'El nombre de usuario es requerido')
      .max(30, 'Nombre de usuario demasiado largo'),
    password: z.string()
      .min(1, 'La contraseña es requerida')
  }),

  changePassword: z.object({
    currentPassword: z.string()
      .min(1, 'La contraseña actual es requerida'),
    newPassword: z.string()
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
      .max(128, 'La contraseña no puede exceder 128 caracteres')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
        'La contraseña debe contener mayúsculas, minúsculas, números y caracteres especiales')
  })
};

export const fileSchemas = {
  upload: z.object({
    files: z.array(z.any()).min(1, 'Se requiere al menos un archivo')
      .max(20, 'No se pueden subir más de 20 archivos a la vez'),
    folderId: z.string().uuid().optional().nullable(),
    description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional()
  }),

  bulkDelete: z.object({
    ids: z.array(z.string().uuid())
      .min(1, 'Se requiere al menos un ID')
      .max(100, 'No se pueden eliminar más de 100 archivos a la vez')
  }),

  bulkMove: z.object({
    ids: z.array(z.string().uuid())
      .min(1, 'Se requiere al menos un ID')
      .max(100, 'No se pueden mover más de 100 archivos a la vez'),
    targetFolderId: z.string().uuid().nullable()
  }),

  search: z.object({
    q: z.string()
      .min(1, 'La consulta de búsqueda es requerida')
      .max(100, 'La consulta de búsqueda no puede exceder 100 caracteres')
      .trim(),
    type: z.enum(['all', 'files', 'folders']).default('all'),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0)
  })
};

export const folderSchemas = {
  create: z.object({
    name: z.string()
      .min(1, 'El nombre de la carpeta es requerido')
      .max(50, 'El nombre no puede exceder 50 caracteres')
      .regex(/^[^<>:"/\\|?*]+$/, 'El nombre contiene caracteres inválidos'),
    parentId: z.string().uuid().nullable().optional()
  }),

  rename: z.object({
    name: z.string()
      .min(1, 'El nombre es requerido')
      .max(50, 'El nombre no puede exceder 50 caracteres')
      .regex(/^[^<>:"/\\|?*]+$/, 'El nombre contiene caracteres inválidos')
  }),

  bulkDelete: z.object({
    ids: z.array(z.string().uuid())
      .min(1, 'Se requiere al menos un ID')
      .max(50, 'No se pueden eliminar más de 50 carpetas a la vez')
  })
};

export const linkSchemas = {
  create: z.object({
    fileId: z.string().uuid('ID de archivo inválido'),
    password: z.string().min(4).max(50).optional(),
    expiresAt: z.string().datetime().optional(),
    maxDownloads: z.number().int().min(1).max(1000).optional()
  }),

  access: z.object({
    password: z.string().optional()
  })
};

// Tipos para TypeScript
export type RegisterInput = z.infer<typeof authSchemas.register>;
export type LoginInput = z.infer<typeof authSchemas.login>;
export type ChangePasswordInput = z.infer<typeof authSchemas.changePassword>;
export type FileUploadInput = z.infer<typeof fileSchemas.upload>;
export type BulkDeleteInput = z.infer<typeof fileSchemas.bulkDelete>;
export type BulkMoveInput = z.infer<typeof fileSchemas.bulkMove>;
export type SearchInput = z.infer<typeof fileSchemas.search>;
export type CreateFolderInput = z.infer<typeof folderSchemas.create>;
export type RenameFolderInput = z.infer<typeof folderSchemas.rename>;
export type CreateLinkInput = z.infer<typeof linkSchemas.create>;
export type AccessLinkInput = z.infer<typeof linkSchemas.access>;
