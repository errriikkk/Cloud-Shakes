import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// Configuración de seguridad con Helmet
export const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'strict-dynamic'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      childSrc: ["'none'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },

  // Configuración de CORS segura
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },

  // Otras configuraciones de seguridad
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});

// Middleware para validar origen
export const validateOrigin = (allowedOrigins: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    if (!origin) {
      return next(); // Permitir peticiones same-origin
    }

    // Verificar si el origen está permitido
    const isAllowed = allowedOrigins.some(allowed => {
      // Soporte para wildcards
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return allowed === origin;
    });

    if (!isAllowed) {
      return res.status(403).json({
        error: 'Origin not allowed',
        message: 'El origen de la petición no está permitido'
      });
    }

    // Establecer CORS headers
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, CSRF-Token');
    res.header('Access-Control-Expose-Headers', 'X-CSRF-Token');
    res.header('Access-Control-Max-Age', '86400'); // 24 horas

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  };
};

// Middleware para sanitizar entrada
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitizar query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = (req.query[key] as string).trim().slice(0, 1000);
      }
    });
  }

  // Sanitizar body para JSON
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj: any, maxDepth = 10, currentDepth = 0): any => {
      if (currentDepth > maxDepth) return null;
      
      if (Array.isArray(obj)) {
        return obj.slice(0, 100).map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
      }
      
      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        const keys = Object.keys(obj).slice(0, 50); // Limitar número de propiedades
        
        for (const key of keys) {
          if (typeof obj[key] === 'string') {
            sanitized[key] = obj[key].trim().slice(0, 1000);
          } else if (typeof obj[key] === 'object') {
            sanitized[key] = sanitizeObject(obj[key], maxDepth, currentDepth + 1);
          } else {
            sanitized[key] = obj[key];
          }
        }
        return sanitized;
      }
      
      return obj;
    };
    
    req.body = sanitizeObject(req.body);
  }

  next();
};
