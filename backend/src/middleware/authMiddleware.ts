import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import prisma from '../config/db';

export interface AuthRequest extends Request {
    user?: any & {
        permissions?: string[];
        roles?: string[];
    };
    file?: Express.Multer.File;
}

const DEFAULT_PERMISSIONS = [
    'view_files',
    'view_documents',
    'view_notes',
    'view_calendar',
    'view_links',
    'view_gallery',
    'view_statistics',
    'view_api_builder'
];

/**
 * Helper function to get user permissions and roles from database
 * Use this to avoid code duplication across routes
 */
export async function getUserPermissions(userId: string): Promise<{
    permissions: string[];
    roles: string[];
    isAdmin: boolean;
}> {
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            roles: {
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!dbUser) {
        return { permissions: [], roles: [], isAdmin: false };
    }

    const userRoles = dbUser.roles || [];
    
    if (userRoles.length === 0) {
        return { 
            permissions: DEFAULT_PERMISSIONS, 
            roles: [], 
            isAdmin: dbUser.isAdmin 
        };
    }

    const permissionKeys = Array.from(
        new Set(
            userRoles.flatMap((ur: any) =>
                ur.role.permissions.map((rp: any) => rp.permission.key),
            ),
        ),
    );

    return {
        permissions: permissionKeys,
        roles: userRoles.map((ur: any) => ur.role.name),
        isAdmin: dbUser.isAdmin,
    };
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

        const dbUser = await (prisma as any).user.findUnique({
            where: { id: decoded.id },
            include: {
                roles: {
                    include: {
                        role: {
                            include: {
                                permissions: {
                                    include: {
                                        permission: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!dbUser) {
            return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        if (!dbUser.isActive) {
            return res.status(403).json({ message: 'User is deactivated' });
        }

        const DEFAULT_PERMISSIONS = [
            'view_files',
            'view_documents',
            'view_notes',
            'view_calendar',
            'view_links',
            'view_gallery',
            'view_statistics',
            'view_api_builder'
        ];

        let permissionKeys: string[];
        const userRoles = (dbUser as any).roles || [];

        if (userRoles.length === 0) {
            permissionKeys = DEFAULT_PERMISSIONS;
        } else {
            permissionKeys = Array.from(
                new Set(
                    userRoles.flatMap((ur: any) =>
                        ur.role.permissions.map((rp: any) => rp.permission.key),
                    ),
                ),
            );
        }

        req.user = {
            id: dbUser.id,
            username: dbUser.username,
            displayName: dbUser.displayName,
            avatar: dbUser.avatar,
            storageLimit: dbUser.storageLimit,
            isAdmin: dbUser.isAdmin,
            roles: userRoles.map((ur: any) => ur.role.name),
            permissions: permissionKeys,
        };
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

export const requirePermission = (permission: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        if (req.user.isAdmin) {
            return next();
        }

        const permissions = req.user.permissions || [];
        if (!permissions.includes(permission)) {
            return res.status(403).json({ message: 'Forbidden: missing permission ' + permission });
        }

        next();
    };
};
