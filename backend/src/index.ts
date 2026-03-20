import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupCallHandlers, getActiveRooms } from './sockets/callHandler';


// Global BigInt serialization fix — BigInt can't be serialized by JSON.stringify natively
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

// Load .env only if not in production or if file exists
import fs from 'fs';
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL is not defined in environment variables.');
}

import authRoutes from './routes/auth';
import fileRoutes from './routes/files';
import shareRoutes from './routes/share';
import folderRoutes from './routes/folders';
import linkRoutes from './routes/links';
import searchRoutes from './routes/search';
import documentRoutes from './routes/documents';
import noteRoutes from './routes/notes';
import calendarRoutes from './routes/calendar';
import chatRoutes from './routes/chat';
import apiFlowRoutes from './routes/apiFlows';
import customRoutes from './routes/custom';
import profileRoutes from './routes/profile';
import rolesRoutes from './routes/roles';
import usersRoutes from './routes/users';
import teamInvitationsRoutes from './routes/teamInvitations';
import activityRoutes from './routes/activity';
import brandingRoutes from './routes/branding';
import cloudSettingsRoutes from './routes/cloudSettings';
import backupsRoutes from './routes/backups';
import blogRoutes from './routes/blog';
import { initStorage } from './utils/storage';
import prisma from './config/db';
import { hashPassword } from './utils/auth';
import { seedAdmin } from './seed';
import { csrfProtection, csrfProtectionLinks } from './middleware/csrfMiddleware';

const isProduction = process.env.NODE_ENV === 'production';

// CORS Origins - Configuración robusta multiplataforma
const getOrigins = () => {
    // En producción, solo usar orígenes de la variable de entorno
    if (isProduction) {
        if (process.env.ALLOWED_ORIGINS) {
            return {
                origins: process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
                patterns: []
            };
        }
        throw new Error('ALLOWED_ORIGINS is required in production');
    }

    // En desarrollo, permitir orígenes configurados + localhost limitado
    const devOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
    ];

    if (process.env.ALLOWED_ORIGINS) {
        const extraOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
        return { origins: [...new Set([...devOrigins, ...extraOrigins])], patterns: [] };
    }
    return { origins: devOrigins, patterns: [] };
};

const allowedOrigins = getOrigins();

const app = express();

// 1. Logs & CORS Priority (MUST BE FIRST)
app.use((req, res, next) => {
    if (process.env.DEBUG === 'true' && req.headers.origin) {
        console.log(`[CORS DEBUG] Request from Origin: ${req.headers.origin} to ${req.method} ${req.path}`);
    }
    next();
});

const publicEndpoints = ['/api/talks/active-rooms', '/api/links/', '/api/links/public/', '/s/', '/d/'];

const isOriginAllowed = (origin: string | undefined): boolean => {
    if (!origin) return true; // Permitir same-origin y requests sin origin (mobile apps)
    
    // Verificar orígenes exactos
    if (allowedOrigins.origins && allowedOrigins.origins.includes(origin)) {
        return true;
    }
    
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Origin bloqueado: ${origin}`);
            callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'X-CSRF-Token', 'Range', 'X-Client-Type'],
    exposedHeaders: ['Set-Cookie', 'Content-Range', 'Accept-Ranges', 'X-Server-Info'],
    optionsSuccessStatus: 200 // Para legacy browsers
}));

// 2. Security (Helmet)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProduction ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*", "https:", "wss:", "http:"],
            frameSrc: ["'self'", "https:", "http:"],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        }
    } : false,
    hsts: isProduction ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    hidePoweredBy: true,
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    // Configuración robusta de transporte para multiplataforma
    transports: ['websocket', 'polling'], // WebSocket con fallback a polling
    allowEIO3: true, // Soporte para clientes antiguos
    cors: {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            } else {
                console.warn(`[Socket CORS] Origin bloqueado: ${origin}`);
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type']
    },
    // Configuración de conexión robusta
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e8 // 100 MB
});

const PORT = process.env.PORT || 5000;

// Seed admin user on startup
// Seed admin user on startup
seedAdmin().catch(err => console.error('Failed to seed admin:', err));

// Trust proxy (required for secure cookies behind Cloudflare/Nginx)
app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request timeout to prevent slowloris attacks
app.use((req, res, next) => {
    res.setTimeout(30000, () => {
        res.status(408).json({ message: 'Request timeout' });
    });
    next();
});

// IP allowlist for admin endpoints (optional, configurable via env)
const adminIpAllowlist = process.env.ADMIN_IP_ALLOWLIST 
    ? process.env.ADMIN_IP_ALLOWLIST.split(',').map(ip => ip.trim())
    : [];

const adminIpMiddleware = (req: any, res: any, next: any) => {
    if (adminIpAllowlist.length === 0) {
        return next(); // No allowlist configured, allow all
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIpFromHeader = forwardedFor ? forwardedFor.split(',')[0].trim() : null;
    
    const allowedIps = [...adminIpAllowlist, '::1', '127.0.0.1', '::ffff:127.0.0.1'];
    
    if (!allowedIps.includes(clientIp) && !allowedIps.includes(clientIpFromHeader || '')) {
        return res.status(403).json({ message: 'Access denied from this IP' });
    }
    next();
};

// Security logging function
const securityLog = (event: string, data: any) => {
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[SECURITY] ${new Date().toISOString()} - ${event}`, JSON.stringify(data));
    }
};

// Log authentication events
app.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function(body: any) {
        if (req.path.startsWith('/api/auth/')) {
            if (res.statusCode === 401) {
                securityLog('AUTH_FAILED', { 
                    path: req.path, 
                    ip: req.ip,
                    userAgent: req.headers['user-agent']
                });
            } else if (res.statusCode === 200 && req.path === '/api/auth/login') {
                securityLog('AUTH_SUCCESS', { 
                    path: req.path,
                    ip: req.ip
                });
            }
        }
        
        // Log permission denied
        if (res.statusCode === 403 && req.path.startsWith('/api/')) {
            securityLog('PERMISSION_DENIED', { 
                path: req.path, 
                method: req.method,
                userId: (req as any).user?.id
            });
        }
        
        return originalSend.call(this, body);
    };
    next();
});

// Global Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '2000'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later." },
});
app.use(limiter);

// Stricter rate limiting for public endpoints (prevent DoS)
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 requests per 15 min for public endpoints
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests to public endpoint." },
});
app.use('/api/links', publicLimiter);
app.use('/api/talks', publicLimiter);
app.use('/health', publicLimiter);

// CSRF Protection — applied to all mutating API requests (except auth endpoints which handle their own CSRF)
app.use('/api/files', csrfProtection);
app.use('/api/folders', csrfProtection);
app.use('/api/links', csrfProtectionLinks); // Custom CSRF for links (excludes public endpoints)
app.use('/api/search', csrfProtection);
app.use('/api/documents', csrfProtection);
app.use('/api/notes', csrfProtection);
app.use('/api/calendar', csrfProtection);
app.use('/api/chat', csrfProtection);
app.use('/api/api-flows', csrfProtection);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/files', shareRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/api-flows', apiFlowRoutes);
app.use('/api/profile', csrfProtection);
app.use('/api/profile', profileRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/cloud-settings', cloudSettingsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/roles', adminIpMiddleware, rolesRoutes);
app.use('/api/users', adminIpMiddleware, usersRoutes);
app.use('/api/team/invitations', teamInvitationsRoutes);
// Custom API routes must be last to catch all /api/custom/* paths
app.use('/api/custom', customRoutes);

// Cloud Talks — active rooms (public, safe data only)
// Handle both with and without trailing slash
app.get(['/api/talks/active-rooms', '/api/talks/active-rooms/'], (req, res) => {
    res.json(getActiveRooms());
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Global Error Handler:', err);

    const origin = req.headers.origin;
    if (origin && !res.get('Access-Control-Allow-Origin')) {
        res.setHeader('Access-Control-Allow-Origin', origin as string);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        message: 'Internal Server Error',
        error: isProduction ? 'Please check server logs for details.' : err.message
    });
});

// Startup: Initialize storage + seed admin
const start = async () => {
    let retries = 10;
    while (retries > 0) {
        try {
            console.log('🔄 Attempting to connect to database...');
            await prisma.$connect();
            console.log('✅ Database connected.');
            break;
        } catch (err) {
            retries -= 1;
            console.warn(`⏳ Waiting for database... (${retries} retries left)`);
            if (err instanceof Error) {
                console.error(`Reason: ${err.message}`);
            }
            if (retries === 0) {
                console.error('❌ Could not connect to database after 10 attempts.');
                throw err;
            }
            await new Promise(res => setTimeout(res, 5000));
        }
    }

    // Verify critical environment variables
    const requiredEnvVars = [
        'JWT_SECRET',
        'DATABASE_URL',
        'MINIO_ROOT_PASSWORD',
        'ADMIN_PASSWORD'
    ];

    const missingVars = requiredEnvVars.filter(key => !process.env[key]);
    if (missingVars.length > 0) {
        throw new Error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    }

    await initStorage();
    console.log('✅ MinIO storage initialized.');

    // Seed / update admin user from environment
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
        throw new Error('❌ ADMIN_USERNAME and ADMIN_PASSWORD must be set.');
    }

    try {
        const hashed = await hashPassword(adminPassword);
        const user = await prisma.user.upsert({
            where: { username: adminUsername },
            update: {
                password: hashed,
                isAdmin: true,
                displayName: 'Admin',
            },
            create: {
                username: adminUsername,
                password: hashed,
                displayName: 'Admin',
                isAdmin: true,
            },
        });
        console.log(`✅ Admin user "${user.username}" is in sync with .env credentials.`);
    } catch (e) {
        console.error('❌ Error seeding/updating admin user:', e);
    }

    setupCallHandlers(io);

    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🔒 Security: Helmet enabled, CSRF protection active, login rate-limited`);
        console.log(`📡 Socket.io: Ready for calls`);
    });

};

start().catch((e) => {
    console.error('❌ CRITICAL FAILURE during server startup:');
    console.error(e);
    process.exit(1);
});
