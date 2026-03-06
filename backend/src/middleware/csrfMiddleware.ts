import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * CSRF Protection Middleware
 * 
 * Validates that mutating requests (POST, PUT, DELETE, PATCH) include
 * a valid CSRF token in the X-CSRF-Token header that matches the one
 * stored in the user's session cookie.
 * 
 * Safe methods (GET, HEAD, OPTIONS) are always allowed through.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    // Allow safe methods
    if (safeMethods.includes(req.method.toUpperCase())) {
        return next();
    }

    // Get CSRF token from header (case-insensitive)
    const csrfTokenFromHeader = (req.headers['x-csrf-token'] || req.headers['X-CSRF-Token']) as string;
    
    // Get CSRF token from cookie (cookie-parser already decodes it)
    let csrfTokenFromCookie = req.cookies['csrf-token'] as string;
    
    // Fallback: try reading from raw cookie header if cookie-parser didn't find it
    if (!csrfTokenFromCookie && req.headers.cookie) {
        const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
        if (cookieMatch) {
            try {
                // Try to decode (cookie-parser should have done this, but just in case)
                csrfTokenFromCookie = decodeURIComponent(cookieMatch[1]);
            } catch {
                csrfTokenFromCookie = cookieMatch[1];
            }
        }
    }

    if (!csrfTokenFromHeader || !csrfTokenFromCookie) {
        console.warn(`[CSRF] Missing token. Header: ${!!csrfTokenFromHeader}, Cookie: ${!!csrfTokenFromCookie}, Path: ${req.path}`);
        console.warn(`[CSRF] Debug - All cookies:`, req.cookies);
        console.warn(`[CSRF] Debug - Raw cookie header:`, req.headers.cookie);
        return res.status(403).json({
            message: 'CSRF token missing',
            debug: { header: !!csrfTokenFromHeader, cookie: !!csrfTokenFromCookie }
        });
    }

    // Normalize tokens (trim whitespace, ensure they're strings)
    const normalizedHeader = String(csrfTokenFromHeader).trim();
    const normalizedCookie = String(csrfTokenFromCookie).trim();

    // Timing-safe comparison
    try {
        const headerBuf = Buffer.from(normalizedHeader, 'utf8');
        const cookieBuf = Buffer.from(normalizedCookie, 'utf8');

        if (headerBuf.length !== cookieBuf.length) {
            console.warn(`[CSRF] Token length mismatch. Header: ${headerBuf.length}, Cookie: ${cookieBuf.length}, Path: ${req.path}`);
            console.warn(`[CSRF] Debug - Header token (first 10 chars): ${normalizedHeader.substring(0, 10)}..., Cookie token (first 10 chars): ${normalizedCookie.substring(0, 10)}...`);
            return res.status(403).json({ message: 'Invalid CSRF token' });
        }

        if (!timingSafeEqual(headerBuf, cookieBuf)) {
            console.warn(`[CSRF] Token mismatch. Path: ${req.path}, Header length: ${headerBuf.length}, Cookie length: ${cookieBuf.length}`);
            console.warn(`[CSRF] Debug - Header token (first 20 chars): ${normalizedHeader.substring(0, 20)}..., Cookie token (first 20 chars): ${normalizedCookie.substring(0, 20)}...`);
            return res.status(403).json({ message: 'Invalid CSRF token' });
        }
    } catch (err) {
        console.error(`[CSRF] Error comparing tokens:`, err);
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }

    next();
};

/**
 * CSRF Protection for Links - excludes public endpoints
 * 
 * Public endpoints that don't require CSRF:
 * - GET /api/links/:id/raw (for embeds)
 * - POST /api/links/:id/verify (public password verification)
 * - GET /api/links/public/:id (public link info)
 */
export const csrfProtectionLinks = (req: Request, res: Response, next: NextFunction) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const publicEndpoints = [
        '/raw',
        '/verify',
        '/public/'
    ];

    // Check if this is a public endpoint
    const isPublicEndpoint = publicEndpoints.some(endpoint => req.path.includes(endpoint));

    // Allow safe methods and public endpoints
    if (safeMethods.includes(req.method.toUpperCase()) || isPublicEndpoint) {
        return next();
    }

    // For mutating requests on private endpoints, require CSRF
    // Get CSRF token from header (case-insensitive)
    const csrfTokenFromHeader = (req.headers['x-csrf-token'] || req.headers['X-CSRF-Token']) as string;
    
    // Get CSRF token from cookie (cookie-parser already decodes it)
    let csrfTokenFromCookie = req.cookies['csrf-token'] as string;
    
    // Fallback: try reading from raw cookie header if cookie-parser didn't find it
    if (!csrfTokenFromCookie && req.headers.cookie) {
        const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
        if (cookieMatch) {
            try {
                // Try to decode (cookie-parser should have done this, but just in case)
                csrfTokenFromCookie = decodeURIComponent(cookieMatch[1]);
            } catch {
                csrfTokenFromCookie = cookieMatch[1];
            }
        }
    }

    if (!csrfTokenFromHeader || !csrfTokenFromCookie) {
        console.warn(`[CSRF] Missing token. Header: ${!!csrfTokenFromHeader}, Cookie: ${!!csrfTokenFromCookie}, Path: ${req.path}`);
        return res.status(403).json({
            message: 'CSRF token missing',
            debug: { header: !!csrfTokenFromHeader, cookie: !!csrfTokenFromCookie }
        });
    }

    // Normalize tokens (trim whitespace, ensure they're strings)
    const normalizedHeader = String(csrfTokenFromHeader).trim();
    const normalizedCookie = String(csrfTokenFromCookie).trim();

    // Timing-safe comparison
    try {
        const headerBuf = Buffer.from(normalizedHeader, 'utf8');
        const cookieBuf = Buffer.from(normalizedCookie, 'utf8');

        if (headerBuf.length !== cookieBuf.length) {
            console.warn(`[CSRF] Token length mismatch. Header: ${headerBuf.length}, Cookie: ${cookieBuf.length}, Path: ${req.path}`);
            return res.status(403).json({ message: 'Invalid CSRF token' });
        }

        if (!timingSafeEqual(headerBuf, cookieBuf)) {
            console.warn(`[CSRF] Token mismatch. Path: ${req.path}, Header length: ${headerBuf.length}, Cookie length: ${cookieBuf.length}`);
            return res.status(403).json({ message: 'Invalid CSRF token' });
        }
    } catch (err) {
        console.error(`[CSRF] Error comparing tokens:`, err);
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }

    next();
};