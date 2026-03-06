import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

// Middleware para auditoría de acciones de administrador
export const auditAdminAction = (action: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Verificar si es admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Se requieren permisos de administrador'
      });
    }

    // Guardar la acción original para auditoría
    const originalSend = res.send;
    let responseData: any;
    let statusCode: number = 200;

    res.send = function(data) {
      responseData = data;
      statusCode = res.statusCode;
      return originalSend.call(this, data);
    };

    // Continuar con la petición
    next();

    // Después de que la petición termine, registrar la auditoría
    res.on('finish', () => {
      logAdminAction({
        adminId: req.user!.id,
        adminUsername: req.user!.username,
        action,
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent'),
        timestamp: new Date(),
        statusCode,
        requestData: sanitizeRequestData(req.body),
        responseData: statusCode >= 400 ? undefined : sanitizeResponseData(responseData),
        success: statusCode >= 200 && statusCode < 300
      });
    });
  };
};

// Función para registrar la acción en la base de datos o logs
const logAdminAction = async (auditData: AdminAuditLog) => {
  try {
    // Aquí podrías guardar en la base de datos
    // await prisma.adminAudit.create({ data: auditData });
    
    // O escribir en un archivo de log
    console.log('[ADMIN_AUDIT]', JSON.stringify(auditData, null, 2));
    
    // O enviar a un servicio de logging externo
    // await sendToLogService(auditData);
    
  } catch (error) {
    console.error('Error al registrar auditoría de admin:', error);
  }
};

// Interfaz para el log de auditoría
interface AdminAuditLog {
  adminId: string;
  adminUsername: string;
  action: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  timestamp: Date;
  statusCode: number;
  requestData?: any;
  responseData?: any;
  success: boolean;
}

// Función para sanitizar datos sensibles en los logs
const sanitizeRequestData = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

// Función para sanitizar datos de respuesta
const sanitizeResponseData = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  
  // Eliminar información sensible de respuestas
  if (data.user) {
    data.user = {
      id: data.user.id,
      username: data.user.username
    };
  }
  
  if (data.token || data.accessToken || data.refreshToken) {
    return { success: true, message: 'Authentication successful' };
  }
  
  return data;
};

// Middleware para requerir autenticación de admin con auditoría
export const requireAdminWithAudit = (action: string) => [
  auditAdminAction(action)
];

// Acciones predefinidas para auditoría
export const AdminActions = {
  USER_DELETE: 'DELETE_USER',
  USER_SUSPEND: 'SUSPEND_USER',
  USER_VIEW_ALL: 'VIEW_ALL_USERS',
  FILE_DELETE_ANY: 'DELETE_ANY_FILE',
  FILE_VIEW_ANY: 'VIEW_ANY_FILE',
  SYSTEM_CONFIG: 'SYSTEM_CONFIG',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  BULK_DELETE_FILES: 'BULK_DELETE_FILES',
  ACCESS_PRIVATE_FILES: 'ACCESS_PRIVATE_FILES',
  MANAGE_STORAGE: 'MANAGE_STORAGE',
  EXPORT_DATA: 'EXPORT_DATA'
};

// Middleware para registrar accesos a recursos sensibles
export const auditSensitiveAccess = (resourceType: string, resourceId?: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const auditData = {
      userId: req.user?.id,
      username: req.user?.username,
      action: `ACCESS_${resourceType.toUpperCase()}`,
      resourceType,
      resourceId,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      success: false // Se actualizará después
    };

    res.on('finish', () => {
      auditData.success = res.statusCode >= 200 && res.statusCode < 300;
      logAdminAction(auditData as any);
    });

    next();
  };
};
