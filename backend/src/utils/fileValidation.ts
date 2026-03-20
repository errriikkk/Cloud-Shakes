import { z } from 'zod';

// Validación de tipos de archivo permitidos
export const ALLOWED_MIME_TYPES = [
  // Imágenes
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/rtf',
  
  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  
  // Video
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/ogg',
  
  // Archivos comprimidos
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  
  // Otros
  'application/json',
  'application/xml',
  'text/xml'
];

// Extensiones permitidas (como respaldo)
export const ALLOWED_EXTENSIONS = [
  // Imágenes
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff',
  
  // Documentos
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.rtf',
  
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  
  // Video
  '.mp4', '.mpeg', '.mov', '.avi', '.webm',
  
  // Comprimidos
  '.zip', '.rar', '.7z', '.gz', '.tar',
  
  // Otros
  '.json', '.xml'
];

// Extensiones peligrosas - BLACKLIST
export const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.app', '.deb', '.pkg', '.dmg', '.rpm', '.msi', '.dll', '.so',
  '.sh', '.ps1', '.py', '.pl', '.rb', '.php', '.asp', '.jsp'
];

// MIME types peligrosos
export const DANGEROUS_MIME_TYPES = [
  'application/x-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-msi',
  'application/x-sh',
  'application/x-shellscript',
  'text/x-php',
  'text/x-python',
  'text/x-perl',
  'text/x-ruby',
  'application/javascript',
  'text/javascript',
  'application/x-java-applet'
];

// Función para validar tipo de archivo
export const validateFileType = (mimeType: string, originalName: string): {
  isValid: boolean;
  isAllowed: boolean;
  isDangerous: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  const extension = originalName.toLowerCase().substring(originalName.lastIndexOf('.'));
  
  // Verificar si es un tipo peligroso
  const isDangerous = DANGEROUS_MIME_TYPES.includes(mimeType) || 
                      DANGEROUS_EXTENSIONS.includes(extension);
  
  if (isDangerous) {
    errors.push('Tipo de archivo no permitido por razones de seguridad');
  }
  
  // Verificar si está en la lista permitida
  const isAllowed = ALLOWED_MIME_TYPES.includes(mimeType) || 
                    ALLOWED_EXTENSIONS.includes(extension);
  
  if (!isAllowed && !isDangerous) {
    errors.push('Tipo de archivo no soportado');
  }
  
  // Validar nombre de archivo
  const sanitizedFileName = sanitizeFileName(originalName);
  if (sanitizedFileName !== originalName) {
    errors.push('El nombre del archivo contiene caracteres inválidos y será sanitizado');
  }
  
  return {
    isValid: errors.length === 0,
    isAllowed: isAllowed && !isDangerous,
    isDangerous,
    errors
  };
};

// Función para sanitizar nombres de archivo
export const sanitizeFileName = (fileName: string): string => {
  // Eliminar caracteres peligrosos
  let sanitized = fileName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Caracteres inválidos en nombres de archivo
    .replace(/\.\./g, '.') // Evitar path traversal
    .replace(/^\.+/, '') // Eliminar puntos al inicio
    .replace(/\.+$/, '') // Eliminar puntos al final
    .trim();
  
  // Limitar longitud
  if (sanitized.length > 255) {
    const extension = sanitized.substring(sanitized.lastIndexOf('.'));
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    const maxNameLength = 255 - extension.length;
    sanitized = nameWithoutExt.substring(0, maxNameLength) + extension;
  }
  
  // Evitar nombres reservados
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  const nameWithoutExt = sanitized.split('.')[0].toUpperCase();
  
  if (reservedNames.includes(nameWithoutExt)) {
    sanitized = `_${sanitized}`;
  }
  
  return sanitized || 'unnamed_file';
};

// Validación Zod para archivos
export const fileValidationSchema = z.object({
  fieldname: z.string(),
  originalname: z.string().transform(sanitizeFileName),
  encoding: z.string().optional(),
  mimetype: z.string().refine((mime) => {
    const validation = validateFileType(mime, 'dummy.txt');
    return validation.isAllowed && !validation.isDangerous;
  }, 'Tipo de archivo no permitido'),
  size: z.number().max(100 * 1024 * 1024, 'El archivo no puede exceder 100MB'),
  buffer: z.instanceof(Buffer).optional()
});

// Esquema actualizado para validación de upload
export const secureFileSchemas = {
  upload: z.object({
    files: z.array(z.any()).min(1, 'Se requiere al menos un archivo')
      .max(20, 'No se pueden subir más de 20 archivos a la vez'),
    folderId: z.string().uuid().optional().nullable(),
    description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional()
  }).refine((data) => {
    // Validación adicional de seguridad
    if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
        if (file.mimetype) {
          const validation = validateFileType(file.mimetype, file.originalname || '');
          if (!validation.isAllowed || validation.isDangerous) {
            return false;
          }
        }
      }
    }
    return true;
  }, {
    message: 'Uno o más archivos tienen tipos no permitidos'
  })
};
