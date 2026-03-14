import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
const JWT_ISSUER = 'shakes-cloud';
const JWT_AUDIENCE = 'shakes-cloud-api';

// Access token: short-lived (15 minutes)
export const generateAccessToken = (payload: object): string => {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: '15m',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    });
};

// Refresh token: long-lived (7 days)
export const generateRefreshToken = (payload: object): string => {
    return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, {
        expiresIn: '7d',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    });
};

// Legacy compat — used in existing code
export const generateToken = (payload: object): string => {
    return generateAccessToken(payload);
};

export const hashPassword = async (password: string): Promise<string> => {
    return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
    });
};

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
    try {
        return await argon2.verify(hash, plain);
    } catch (err) {
        return false;
    }
};

export const verifyToken = (token: string): any => {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
    } catch (err) {
        return null;
    }
};

// CSRF token generation
export const generateCsrfToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

// Verify CSRF token by simple comparison
export const verifyCsrfToken = (token: string, expected: string): boolean => {
    if (!token || !expected) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
        return false;
    }
};
