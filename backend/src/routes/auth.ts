import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import prisma from '../config/db';
import {
    verifyPassword, generateAccessToken, generateRefreshToken,
    hashPassword, verifyToken, generateCsrfToken
} from '../utils/auth';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { decryptTotpSecret, encryptTotpSecret } from '../utils/totpSecret';

const router = express.Router();

// Login-specific rate limiter: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en 15 minutos.' },
    keyGenerator: (req) => {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    },
    validate: { xForwardedForHeader: false },
});

const deviceFlowLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many device authorization requests. Please try again later.' },
});

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP inválido').optional(),
});

// @route   POST /api/auth/login
// @desc    Auth user & get access + refresh tokens
// @access  Public
router.post('/login', loginLimiter, async (req, res, next) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (user && (await verifyPassword(user.password, password))) {
            // 2FA gate
            if ((user as any).twoFactorEnabled) {
                const otp = (req.body?.otp as string | undefined)?.trim();
                if (!otp) {
                    return res.status(401).json({ message: '2FA requerido', requiresTwoFactor: true });
                }
                const secret = decryptTotpSecret((user as any).twoFactorSecret);
                if (!secret || !authenticator.check(otp, secret)) {
                    return res.status(401).json({ message: 'Código 2FA inválido', requiresTwoFactor: true });
                }
            }

            const accessToken = generateAccessToken({ id: user.id });
            const refreshToken = generateRefreshToken({ id: user.id });
            const csrfToken = generateCsrfToken();

            const isProduction = process.env.NODE_ENV === 'production';
            const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. .shakes.es

            // Access token cookie (15 min)
            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax', // Must be 'none' for cross-site (cloud. -> api.)
                domain: isProduction ? cookieDomain : undefined,
                maxAge: 15 * 60 * 1000, // 15 minutes
            });

            // Refresh token cookie (7 days)
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax',
                domain: isProduction ? cookieDomain : undefined,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/api/auth', // Only sent to auth endpoints
            });

            // CSRF token cookie - httpOnly for security, frontend reads from response body
            res.cookie('csrf-token', csrfToken, {
                httpOnly: true, // Security: not accessible by JS
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax',
                domain: isProduction ? cookieDomain : undefined,
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            // Log successful login
            await createActivity(
                user.id,
                'auth',
                'login',
                undefined, // resourceId
                undefined, // resourceType
                `User ${user.username} logged in from ${req.headers['x-forwarded-for'] as string || req.socket.remoteAddress}`,
                { ip: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress }
            );

            return res.json({
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                csrfToken,
                twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
            });
        } else {
            // Generic error message - don't reveal whether user exists
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// ─────────────────────────────────────────────────────────────
// 2FA (TOTP) — lightweight, OSS
// ─────────────────────────────────────────────────────────────
router.get('/2fa/status', protect, async (req: AuthRequest, res, next) => {
    try {
        const dbUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
        });
        res.json({
            enabled: dbUser?.twoFactorEnabled ?? false,
            enabledAt: dbUser?.twoFactorEnabledAt ?? null,
        });
    } catch (e) {
        next(e);
    }
});

router.post('/2fa/setup', protect, async (req: AuthRequest, res, next) => {
    try {
        const dbUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, username: true, twoFactorEnabled: true },
        });
        if (!dbUser) return res.status(404).json({ message: 'User not found' });
        if (dbUser.twoFactorEnabled) {
            return res.status(400).json({ message: '2FA ya está activado' });
        }

        const secret = authenticator.generateSecret();
        const appName = process.env.TOTP_ISSUER || 'Cloud Shakes';
        const label = `${appName}:${dbUser.username}`;
        const otpauth = authenticator.keyuri(dbUser.username, appName, secret);

        const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });

        await prisma.user.update({
            where: { id: dbUser.id },
            data: {
                twoFactorPendingSecret: encryptTotpSecret(secret),
            },
        });

        res.json({
            otpauth,
            qrDataUrl,
            label,
        });
    } catch (e) {
        next(e);
    }
});

const otpConfirmSchema = z.object({
    otp: z.string().trim().regex(/^\d{6}$/),
});

router.post('/2fa/confirm', protect, async (req: AuthRequest, res, next) => {
    try {
        const { otp } = otpConfirmSchema.parse(req.body);

        const dbUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, twoFactorEnabled: true, twoFactorPendingSecret: true },
        });
        if (!dbUser) return res.status(404).json({ message: 'User not found' });
        if (dbUser.twoFactorEnabled) return res.status(400).json({ message: '2FA ya está activado' });

        const pendingSecret = decryptTotpSecret(dbUser.twoFactorPendingSecret);
        if (!pendingSecret) {
            return res.status(400).json({ message: 'No hay setup pendiente' });
        }

        if (!authenticator.check(otp, pendingSecret)) {
            return res.status(400).json({ message: 'Código inválido' });
        }

        await prisma.user.update({
            where: { id: dbUser.id },
            data: {
                twoFactorEnabled: true,
                twoFactorSecret: dbUser.twoFactorPendingSecret,
                twoFactorPendingSecret: null,
                twoFactorEnabledAt: new Date(),
            },
        });

        res.json({ ok: true, enabled: true });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ errors: (e as any).errors });
        }
        next(e);
    }
});

router.post('/2fa/disable', protect, async (req: AuthRequest, res, next) => {
    try {
        const { otp } = otpConfirmSchema.parse(req.body);
        const dbUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
        });
        if (!dbUser) return res.status(404).json({ message: 'User not found' });
        if (!dbUser.twoFactorEnabled) return res.status(400).json({ message: '2FA no está activado' });

        const secret = decryptTotpSecret(dbUser.twoFactorSecret);
        if (!secret || !authenticator.check(otp, secret)) {
            return res.status(400).json({ message: 'Código inválido' });
        }

        await prisma.user.update({
            where: { id: dbUser.id },
            data: {
                twoFactorEnabled: false,
                twoFactorSecret: null,
                twoFactorPendingSecret: null,
                twoFactorEnabledAt: null,
            },
        });

        res.json({ ok: true, enabled: false });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ errors: (e as any).errors });
        }
        next(e);
    }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public (requires valid refresh token cookie)
router.post('/refresh', async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ message: 'No refresh token' });
        }

        const decoded = verifyToken(refreshToken);
        if (!decoded || decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Verify user still exists
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, isAdmin: true },
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const newAccessToken = generateAccessToken({ id: user.id });
        const newCsrfToken = generateCsrfToken();
        const isProduction = process.env.NODE_ENV === 'production';

        const cookieDomain = process.env.COOKIE_DOMAIN;
        res.cookie('token', newAccessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            domain: isProduction ? cookieDomain : undefined,
            maxAge: 15 * 60 * 1000,
        });

        res.cookie('csrf-token', newCsrfToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            domain: isProduction ? cookieDomain : undefined,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.json({
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            csrfToken: newCsrfToken,
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear all cookies
// @access  Private
router.post('/logout', protect, async (req: AuthRequest, res) => {
    const isProduction = process.env.NODE_ENV === 'production';

    const cookieDomain = process.env.COOKIE_DOMAIN;
    res.cookie('token', '', { httpOnly: true, expires: new Date(0), secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });
    res.cookie('refreshToken', '', { httpOnly: true, expires: new Date(0), path: '/api/auth', secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });
    res.cookie('csrf-token', '', { httpOnly: true, expires: new Date(0), secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });

    // Log logout
    await createActivity(
        req.user.id,
        'auth',
        'logout',
        undefined,
        undefined,
        `User logged out`
    );

    res.json({ message: 'Logged out' });
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, async (req: AuthRequest, res, next) => {
    // Force browser not to cache this response so permissions updates reflect immediately on F5 or focus
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
        const user = req.user;
        const csrfToken = req.cookies['csrf-token'];

        // Get avatar URL if exists
        let avatarUrl = null;
        if (user.avatar) {
            try {
                const apiBase =
                    process.env.API_URL ||
                    (process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin.replace('cloud.', 'api.') : null) ||
                    'http://localhost:5000';

                // New private avatar storage (MinIO object key)
                if ((user as any).avatar.startsWith('avatars/')) {
                    avatarUrl = `${apiBase}/api/profile/avatar?v=${Date.now()}`;
                } else {
                const file = await prisma.file.findUnique({
                    where: { id: user.avatar },
                    select: { storedName: true, mimeType: true },
                });
                if (file) {
                    avatarUrl = `${apiBase}/api/files/${user.avatar}/preview`;
                } else {
                    avatarUrl = user.avatar;
                }
                }
            } catch {
                avatarUrl = user.avatar;
            }
        }

        res.json({
            ...user,
            avatarUrl,
            storageLimit: user.storageLimit?.toString() ?? '53687091200',
            csrfToken,
        });
    } catch (err) {
        next(err);
    }
});
// @route   POST /api/auth/device-token
// @desc    Generate JWT tokens in response body for an authorized device (desktop app)
// @access  Private (user must be logged in via web session)
router.post('/device-token', protect, async (req: AuthRequest, res, next) => {
    try {
        const user = req.user;

        const accessToken = generateAccessToken({ id: user.id });
        const refreshToken = generateRefreshToken({ id: user.id });

        return res.json({
            accessToken,
            refreshToken,
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
        });
    } catch (error) {
        next(error);
    }
});


// @desc    Login and get tokens in response body (for desktop/API clients)
// @access  Public
router.post('/token-login', loginLimiter, async (req, res, next) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (user && (await verifyPassword(user.password, password))) {
            // 2FA gate for API clients
            if ((user as any).twoFactorEnabled) {
                const otp = (req.body?.otp as string | undefined)?.trim();
                if (!otp) {
                    return res.status(401).json({ message: '2FA requerido', requiresTwoFactor: true });
                }
                const secret = decryptTotpSecret((user as any).twoFactorSecret);
                if (!secret || !authenticator.check(otp, secret)) {
                    return res.status(401).json({ message: 'Código 2FA inválido', requiresTwoFactor: true });
                }
            }

            const accessToken = generateAccessToken({ id: user.id });
            const refreshToken = generateRefreshToken({ id: user.id });

            return res.json({
                accessToken,
                refreshToken,
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
            });
        } else {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   POST /api/auth/token-refresh
// @desc    Refresh access token using refresh token from body (for desktop/API clients)
// @access  Public (requires valid refresh token)
router.post('/token-refresh', async (req, res, next) => {
    try {
        const { refreshToken: refreshTokenBody } = req.body;

        if (!refreshTokenBody) {
            return res.status(401).json({ message: 'No refresh token' });
        }

        const decoded = verifyToken(refreshTokenBody);
        if (!decoded || decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, isAdmin: true },
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const newAccessToken = generateAccessToken({ id: user.id });
        const newRefreshToken = generateRefreshToken({ id: user.id });

        return res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
        });
    } catch (error) {
        next(error);
    }
});

// In-memory store for device codes (in production, use Redis or DB)
export const deviceCodes = new Map<string, {
    deviceCode: string;
    userCode: string;
    clientId: string;
    userId?: string;
    expiresAt: Date;
    interval: number;
}>();

// @route   POST /api/auth/device/code
// @desc    Request device authorization code
// @access  Public
router.post('/device/code', deviceFlowLimiter, async (req, res, next) => {
    try {
        const { client_id } = req.body;
        
        if (!client_id) {
            return res.status(400).json({ error: 'client_id required' });
        }

        // Generate device and user codes
        const deviceCode = generateRandomString(40);
        const userCode = generateRandomString(8).toUpperCase();
        
        // Store code (expires in 15 minutes, poll every 5 seconds)
        deviceCodes.set(deviceCode, {
            deviceCode,
            userCode,
            clientId: client_id,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            interval: 5,
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9090';
        res.json({
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${frontendUrl}/dashboard/device-auth`,
            verification_uri_complete: `${frontendUrl}/dashboard/device-auth?code=${userCode}`,
            expires_in: 900,
            interval: 5,
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/device/token
// @desc    Poll for device authorization token
// @access  Public
router.post('/device/token', deviceFlowLimiter, async (req, res, next) => {
    try {
        const { grant_type, device_code, client_id } = req.body;

        if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
            return res.status(400).json({ error: 'invalid_grant_type' });
        }

        const codeData = deviceCodes.get(device_code);

        if (!codeData) {
            return res.status(403).json({ error: 'expired_token' });
        }

        if (new Date() > codeData.expiresAt) {
            deviceCodes.delete(device_code);
            return res.status(403).json({ error: 'expired_token' });
        }

        if (!codeData.userId) {
            // User hasn't authorized yet
            return res.status(403).json({ error: 'authorization_pending' });
        }

        // Check client_id matches
        if (codeData.clientId !== client_id) {
            return res.status(403).json({ error: 'invalid_client' });
        }

        // Generate tokens
        const accessToken = generateAccessToken({ id: codeData.userId });
        const refreshToken = generateRefreshToken({ id: codeData.userId });

        // Clean up device code
        deviceCodes.delete(device_code);

        res.json({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: 900,
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /device/verify
// @desc    Device verification redirect (legacy compatibility)
// @access  Public
router.get('/device/verify', (req, res) => {
    const userCode = req.query.code as string;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9090';
    const safeCode = userCode ? encodeURIComponent(userCode) : '';
    res.redirect(`${frontendUrl}/dashboard/device-auth?code=${safeCode}`);
});

// @route   POST /api/auth/device/confirm
// @desc    Confirm device authorization
// @access  Private
router.post('/device/confirm', deviceFlowLimiter, protect, async (req: AuthRequest, res, next) => {
    try {
        const { userCode, action } = req.body;
        
        if (action === 'deny') {
            return res.json({ message: 'Authorization denied' });
        }

        // Find and update the device code
        let found = false;
        for (const [deviceCode, data] of deviceCodes) {
            if (data.userCode === userCode) {
                data.userId = req.user.id;
                found = true;
                break;
            }
        }

        if (!found) {
            return res.status(404).json({ error: 'invalid_code', message: 'Código expirado o inválido' });
        }

        res.json({ message: 'Authorization successful' });
    } catch (error) {
        next(error);
    }
});

// Helper function to generate random string
function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % chars.length];
    }
    return result;
}

export default router;
