import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Rate limiters para diferentes endpoints
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || 'Too many requests, please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: options.message || 'Too many requests, please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    }
  });
};

// Rate limiters específicos
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos
  message: 'Too many login attempts, please try again in 15 minutes.'
});

export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por hora
  message: 'Too many registration attempts, please try again in 1 hour.'
});

export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 uploads por minuto
  message: 'Too many upload attempts, please try again in 1 minute.'
});

export const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // máximo 30 búsquedas por minuto
  message: 'Too many search requests, please try again in 1 minute.'
});

export const linkLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // máximo 5 enlaces por minuto
  message: 'Too many link creation attempts, please try again in 1 minute.'
});

export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 peticiones generales
  message: 'Too many requests, please try again in 15 minutes.'
});

export const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 reseteos por hora
  message: 'Too many password reset attempts, please try again in 1 hour.'
});
