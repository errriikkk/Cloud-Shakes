import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import prisma from '../config/db';

export interface AuthRequest extends Request {
    user?: any;
    file?: Express.Multer.File;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token: string | undefined;

    // 1. Check httpOnly cookie
    if (req.cookies.token) {
        token = req.cookies.token;
    }

    // 2. Fallback: check Authorization header (for API clients)
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }

        // Reject refresh tokens used as access tokens
        if (decoded.type === 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, isAdmin: true, displayName: true, avatar: true, storageLimit: true },
        });

        if (!user) {
            return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

export const admin = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
};
