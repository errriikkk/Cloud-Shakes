import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../config/db';
import {
    verifyPassword, generateAccessToken, generateRefreshToken,
    hashPassword, verifyToken, generateCsrfToken
} from '../utils/auth';
import { protect, AuthRequest } from '../middleware/authMiddleware';

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

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(6),
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

            // CSRF token cookie (readable by frontend JS)
            res.cookie('csrf-token', csrfToken, {
                httpOnly: false, // Must be readable by JS
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax',
                domain: isProduction ? cookieDomain : undefined,
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            return res.json({
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                csrfToken,
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
            httpOnly: false,
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
router.post('/logout', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';

    const cookieDomain = process.env.COOKIE_DOMAIN;
    res.cookie('token', '', { httpOnly: true, expires: new Date(0), secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });
    res.cookie('refreshToken', '', { httpOnly: true, expires: new Date(0), path: '/api/auth', secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });
    res.cookie('csrf-token', '', { httpOnly: false, expires: new Date(0), secure: isProduction, sameSite: isProduction ? 'none' : 'lax', domain: isProduction ? cookieDomain : undefined });

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
                const file = await prisma.file.findUnique({
                    where: { id: user.avatar },
                    select: { storedName: true, mimeType: true },
                });
                if (file) {
                    avatarUrl = `${process.env.API_URL || process.env.FRONTEND_URL?.replace('cloud.', 'api.') || 'http://localhost:5000'}/api/files/${user.avatar}/preview`;
                } else {
                    avatarUrl = user.avatar;
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
            const accessToken = generateAccessToken({ id: user.id });
            const refreshToken = generateRefreshToken({ id: user.id });

            return res.json({
                accessToken,
                refreshToken,
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
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

export default router;
