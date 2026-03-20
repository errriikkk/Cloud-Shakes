import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const prismaAny = prisma as any;

const createConversationSchema = z.object({
    name: z.string().optional(),
    isGroup: z.boolean().optional(),
    participantIds: z.array(z.string()).min(1),
});

const sendMessageSchema = z.object({
    content: z.string().min(1),
    type: z.enum(['text', 'file', 'system']).optional(),
    metadata: z.any().optional(),
});

const updateMessageSchema = z.object({
    content: z.string().min(1),
});

const updateNotificationSchema = z.object({
    notifications: z.enum(['all', 'mentions', 'none']),
});

// @route   GET /api/chat/conversations
// @desc    Get all conversations for current user
// @access  Private
router.get('/conversations', protect, async (req: AuthRequest, res, next) => {
    try {
        const conversations = await prismaAny.conversation.findMany({
            where: {
                participants: {
                    some: { userId: req.user!.id }
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, username: true, displayName: true, avatar: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: {
                            select: { id: true, username: true, displayName: true }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Get user statuses
        const userIds: string[] = conversations.flatMap((c: any) => c.participants.map((p: any) => p.userId));
        const uniqueUserIds = [...new Set(userIds)];
        const statuses = await prismaAny.userStatus.findMany({
            where: { userId: { in: uniqueUserIds } }
        });

        const statusMap = new Map<string, any>(statuses.map((s: any) => [s.userId, s]));

        const result = conversations.map((conv: any) => ({
            ...conv,
            participants: conv.participants.map((p: any) => ({
                ...p,
                user: {
                    ...p.user,
                    status: statusMap.get(p.userId)?.status || 'offline'
                }
            })),
            lastMessage: conv.messages[0] || null,
            unreadCount: 0
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/chat/conversations
// @desc    Create a new conversation
// @access  Private
router.post('/conversations', protect, requirePermission('create_chats'), async (req: AuthRequest, res, next) => {
    try {
        const { name, isGroup, participantIds } = createConversationSchema.parse(req.body);

        // Verify all participants exist
        const participants = await prismaAny.user.findMany({
            where: { id: { in: participantIds } },
            select: { id: true }
        });

        if (participants.length !== participantIds.length) {
            return res.status(400).json({ message: 'Some users do not exist' });
        }

        // Prevent duplicate 1-on-1 conversations
        if (!isGroup && participantIds.length === 1) {
            const otherUserId = participantIds[0];

            const existingConversation = await prismaAny.conversation.findFirst({
                where: {
                    isGroup: false,
                    AND: [
                        { participants: { some: { userId: req.user!.id } } },
                        { participants: { some: { userId: otherUserId } } },
                    ]
                },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: { id: true, username: true, displayName: true, avatar: true }
                            }
                        }
                    }
                }
            });

            if (existingConversation) {
                return res.status(409).json({
                    message: 'Conversation already exists with this user',
                    conversation: existingConversation
                });
            }
        }

        const conversation = await prismaAny.conversation.create({
            data: {
                name: isGroup ? name : null,
                isGroup: isGroup || false,
                createdById: req.user!.id,
                participants: {
                    create: [
                        { userId: req.user!.id, role: 'admin' },
                        ...participantIds.map((id: string) => ({ userId: id, role: 'member' }))
                    ]
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, username: true, displayName: true, avatar: true }
                        }
                    }
                }
            }
        });

        res.json(conversation);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        next(error);
    }
});

// @route   GET /api/chat/conversations/:id
// @desc    Get a conversation by ID
// @access  Private
router.get('/conversations/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const conversation = await prismaAny.conversation.findFirst({
            where: {
                id: req.params.id,
                participants: { some: { userId: req.user!.id } }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, username: true, displayName: true, avatar: true }
                        }
                    }
                }
            }
        });

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        res.json(conversation);
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/chat/conversations/:id/messages
// @desc    Get messages in a conversation
// @access  Private
router.get('/conversations/:id/messages', protect, async (req: AuthRequest, res, next) => {
    try {
        const { before, limit = 50 } = req.query;

        // Verify user is participant
        const participant = await prismaAny.conversationParticipant.findFirst({
            where: {
                conversationId: req.params.id,
                userId: req.user!.id
            }
        });

        if (!participant) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        const messages = await prismaAny.message.findMany({
            where: {
                conversationId: req.params.id,
                deletedAt: null,
                ...(before ? { createdAt: { lt: new Date(before as string) } } : {})
            },
            include: {
                sender: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                },
                reactions: {
                    include: {
                        user: {
                            select: { id: true, username: true, displayName: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: Number(limit)
        });

        // Mark as read
        await prismaAny.conversationParticipant.update({
            where: { id: participant.id },
            data: { lastReadAt: new Date() }
        });

        res.json(messages.reverse());
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send a message
// @access  Private
router.post('/conversations/:id/messages', protect, requirePermission('send_messages'), async (req: AuthRequest, res, next) => {
    try {
        const { content, type, metadata } = sendMessageSchema.parse(req.body);

        // Verify user is participant
        const participant = await prismaAny.conversationParticipant.findFirst({
            where: {
                conversationId: req.params.id,
                userId: req.user!.id
            }
        });

        if (!participant) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        // Parse @mentions from content
        const mentionRegex = /@(\[(user|file|folder):[^\]]+\])/g;
        const mentions: { type: 'user' | 'file' | 'folder'; id: string; name: string }[] = [];
        let match: RegExpExecArray | null;

        while ((match = mentionRegex.exec(content)) !== null) {
            try {
                const parsed = JSON.parse(match[1]);
                mentions.push(parsed);
            } catch {
                // Invalid mention format, skip
            }
        }

        // Validate file/folder mentions if present
        if (mentions.some(m => m.type === 'file' || m.type === 'folder')) {
            const fileMentions = mentions.filter(m => m.type === 'file' || m.type === 'folder');
            const fileIds = fileMentions.map(m => m.id);

            // Check if user has share permission
            const userRoles = await prismaAny.userRole.findMany({
                where: { userId: req.user!.id },
                include: { role: { include: { permissions: { include: { permission: true } } } } }
            });

            const permissions = new Set<string>(
                userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.key))
            );

            if (!req.user!.isAdmin && !permissions.has('share_files')) {
                return res.status(403).json({
                    message: 'No tienes permiso para compartir archivos en el chat',
                    code: 'NO_SHARE_PERMISSION'
                });
            }

            // Verify user has access to the files
            const accessibleFiles = await prismaAny.file.findMany({
                where: {
                    id: { in: fileIds },
                    OR: [
                        { ownerId: req.user!.id },
                        { folder: { ownerId: req.user!.id } }
                    ]
                },
                select: { id: true }
            });

            const accessibleFileIds = new Set<string>(accessibleFiles.map((f: any) => f.id));
            const inaccessibleFiles = fileMentions.filter(m => !accessibleFileIds.has(m.id));

            if (inaccessibleFiles.length > 0) {
                return res.status(403).json({
                    message: `No tienes acceso a algunos archivos: ${inaccessibleFiles.map(f => f.name).join(', ')}`,
                    code: 'FILE_ACCESS_DENIED',
                    inaccessibleFiles: inaccessibleFiles.map(f => f.id)
                });
            }
        }

        // Build message metadata with mentions
        const messageMetadata = {
            ...metadata,
            mentions: mentions.length > 0 ? mentions : undefined,
            mentionCount: mentions.length
        };

        const message = await prismaAny.message.create({
            data: {
                conversationId: req.params.id,
                senderId: req.user!.id,
                content,
                type: type || 'text',
                metadata: messageMetadata
            },
            include: {
                sender: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                }
            }
        });

        // Update conversation lastMessageAt
        await prismaAny.conversation.update({
            where: { id: req.params.id },
            data: { lastMessageAt: new Date() }
        });

        // Notify mentioned users
        const userMentions = mentions.filter(m => m.type === 'user');
        if (userMentions.length > 0) {
            const conversation = await prismaAny.conversation.findUnique({
                where: { id: req.params.id },
                include: { participants: true }
            });

            const participantIds: string[] = conversation?.participants.map((p: any) => p.userId) || [];

            for (const mention of userMentions) {
                if (participantIds.includes(mention.id) && mention.id !== req.user!.id) {
                    await prismaAny.notification.create({
                        data: {
                            userId: mention.id,
                            type: 'MENTION',
                            title: 'Te mencionaron en un chat',
                            message: `${req.user!.displayName || req.user!.username} te mencionó en una conversación`,
                            link: `/dashboard/chat/${req.params.id}`
                        }
                    });
                }
            }
        }

        res.json(message);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        next(error);
    }
});

// @route   PUT /api/chat/messages/:id
// @desc    Edit a message
// @access  Private
router.put('/messages/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const { content } = updateMessageSchema.parse(req.body);

        const message = await prismaAny.message.findUnique({
            where: { id: req.params.id }
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Only sender can edit
        if (message.senderId !== req.user!.id) {
            return res.status(403).json({ message: 'Not authorized to edit this message' });
        }

        const updated = await prismaAny.message.update({
            where: { id: req.params.id },
            data: { content },
            include: {
                sender: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                }
            }
        });

        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        next(error);
    }
});

// @route   DELETE /api/chat/messages/:id
// @desc    Delete a message (soft delete)
// @access  Private
router.delete('/messages/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const message = await prismaAny.message.findUnique({
            where: { id: req.params.id }
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Only sender can delete
        if (message.senderId !== req.user!.id) {
            return res.status(403).json({ message: 'Not authorized to delete this message' });
        }

        await prismaAny.message.update({
            where: { id: req.params.id },
            data: { deletedAt: new Date(), content: '[Message deleted]' }
        });

        res.json({ message: 'Message deleted' });
    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/chat/conversations/:id/notifications
// @desc    Update notification settings for a conversation
// @access  Private
router.put('/conversations/:id/notifications', protect, async (req: AuthRequest, res, next) => {
    try {
        // Fix: parse from req.body instead of req.query
        const { notifications } = updateNotificationSchema.parse(req.body);

        const participant = await prismaAny.conversationParticipant.findFirst({
            where: {
                conversationId: req.params.id,
                userId: req.user!.id
            }
        });

        if (!participant) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        const updated = await prismaAny.conversationParticipant.update({
            where: { id: participant.id },
            data: { notifications }
        });

        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        next(error);
    }
});

// @route   GET /api/chat/users
// @desc    Get all users for starting a conversation
// @access  Private
router.get('/users', protect, async (req: AuthRequest, res, next) => {
    try {
        const users = await prismaAny.user.findMany({
            where: { id: { not: req.user!.id } },
            include: {
                roles: {
                    include: {
                        role: {
                            select: { name: true, color: true }
                        }
                    }
                }
            }
        });

        // Get statuses
        const userIds: string[] = users.map((u: any) => u.id);
        const statuses = await prismaAny.userStatus.findMany({
            where: { userId: { in: userIds } }
        });

        const statusMap = new Map<string, string>(statuses.map((s: any) => [s.userId, s.status]));

        const result = users.map((user: any) => ({
            ...user,
            status: statusMap.get(user.id) || 'offline',
            roles: user.roles.map((r: any) => r.role.name)
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/chat/status
// @desc    Update user status (online, away, dnd)
// @access  Private
router.put('/status', protect, async (req: AuthRequest, res, next) => {
    try {
        const { status, custom } = req.body;

        if (!['online', 'away', 'dnd', 'offline'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const userStatus = await prismaAny.userStatus.upsert({
            where: { userId: req.user!.id },
            update: { status, custom, lastSeen: new Date() },
            create: { userId: req.user!.id, status, custom }
        });

        res.json(userStatus);
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/chat/status
// @desc    Get user statuses
// @access  Private
router.get('/status', protect, async (req: AuthRequest, res, next) => {
    try {
        const statuses = await prismaAny.userStatus.findMany();
        res.json(statuses);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/chat/conversations/:id/leave
// @desc    Leave a conversation
// @access  Private
router.post('/conversations/:id/leave', protect, async (req: AuthRequest, res, next) => {
    try {
        const participant = await prismaAny.conversationParticipant.findFirst({
            where: {
                conversationId: req.params.id,
                userId: req.user!.id
            }
        });

        if (!participant) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        await prismaAny.conversationParticipant.delete({
            where: { id: participant.id }
        });

        res.json({ message: 'Left conversation' });
    } catch (err) {
        next(err);
    }
});

// @route   DELETE /api/chat/conversations/:id
// @desc    Delete a conversation (admin only)
// @access  Private
router.delete('/conversations/:id', protect, requirePermission('delete_conversations'), async (req: AuthRequest, res, next) => {
    try {
        const conversation = await prismaAny.conversation.findUnique({
            where: { id: req.params.id },
            include: { participants: true }
        });

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Only creator or admin can delete
        if (conversation.createdById !== req.user!.id && !req.user!.isAdmin) {
            return res.status(403).json({ message: 'Not authorized to delete this conversation' });
        }

        // Delete all messages in the conversation
        await prismaAny.message.deleteMany({
            where: { conversationId: req.params.id }
        });

        // Delete all participants
        await prismaAny.conversationParticipant.deleteMany({
            where: { conversationId: req.params.id }
        });

        // Delete the conversation
        await prismaAny.conversation.delete({
            where: { id: req.params.id }
        });

        res.json({ message: 'Conversation deleted' });
    } catch (err) {
        next(err);
    }
});

// @route   GET /api/chat/search-mentions
// @desc    Search files, folders, and users for @mentions
// @access  Private
router.get('/search-mentions', protect, async (req: AuthRequest, res, next) => {
    try {
        const { query, type } = req.query;
        const searchTerm = (query as string || '').toLowerCase();
        const userId = req.user!.id;

        const results: {
            type: 'user' | 'file' | 'folder';
            id: string;
            name: string;
            path?: string;
            folderId?: string;
            canShare: boolean;
            sharedBy?: string;
        }[] = [];

        // Search users
        if (!type || type === 'user') {
            const users = await prismaAny.user.findMany({
                where: {
                    id: { not: userId },
                    OR: [
                        { username: { contains: searchTerm, mode: 'insensitive' } },
                        { displayName: { contains: searchTerm, mode: 'insensitive' } }
                    ]
                },
                select: { id: true, username: true, displayName: true },
                take: 5
            });

            users.forEach((user: any) => {
                results.push({
                    type: 'user',
                    id: user.id,
                    name: user.displayName || user.username,
                    canShare: true
                });
            });
        }

        // Search files user has access to
        if (!type || type === 'file' || type === 'folder') {
            // Get user permissions
            const userRoles = await prismaAny.userRole.findMany({
                where: { userId },
                include: { role: { include: { permissions: { include: { permission: true } } } } }
            });

            const permissions = new Set<string>(
                userRoles.flatMap((ur: any) =>
                    ur.role.permissions.map((p: any) => p.permission.key)
                )
            );

            const canShare = req.user!.isAdmin || permissions.has('share_files');

            // Get shared file IDs via links
            const sharedFileLinks = await prismaAny.link.findMany({
                where: {
                    type: 'file',
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                },
                select: { fileId: true }
            });
            const sharedFileIds = new Set<string>(sharedFileLinks.map((l: any) => l.fileId).filter(Boolean));

            // Search files owned by user, in user's folders, OR shared via links
            const userFiles = await prismaAny.file.findMany({
                where: {
                    OR: [
                        { ownerId: userId },
                        { folder: { ownerId: userId } },
                        { id: { in: Array.from(sharedFileIds) } }
                    ],
                    originalName: { contains: searchTerm, mode: 'insensitive' }
                },
                select: {
                    id: true,
                    originalName: true,
                    ownerId: true,
                    folderId: true,
                    folder: {
                        select: { id: true, name: true }
                    }
                },
                take: 10
            });

            userFiles.forEach((file: any) => {
                const filePath = file.folder?.name
                    ? `${file.folder.name}/${file.originalName}`
                    : file.originalName;

                results.push({
                    type: 'file',
                    id: file.id,
                    name: file.originalName,
                    path: filePath,
                    folderId: file.folderId || file.folder?.id,
                    canShare: canShare,
                    sharedBy: file.ownerId !== userId ? 'shared' : undefined
                });
            });

            // Search folders owned by user AND folders shared via links
            const sharedFolderIds = await prismaAny.link.findMany({
                where: {
                    type: 'folder',
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                },
                select: { folderId: true }
            });
            const sharedFolderIdSet = new Set<string>(sharedFolderIds.map((l: any) => l.folderId).filter(Boolean));

            const userFolders = await prismaAny.folder.findMany({
                where: {
                    OR: [
                        { ownerId: userId },
                        { id: { in: Array.from(sharedFolderIdSet) } }
                    ],
                    name: { contains: searchTerm, mode: 'insensitive' }
                },
                select: {
                    id: true,
                    name: true
                },
                take: 5
            });

            userFolders.forEach((folder: any) => {
                results.push({
                    type: 'folder',
                    id: folder.id,
                    name: folder.name,
                    path: folder.name,
                    canShare: canShare
                });
            });
        }

        res.json(results);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/chat/validate-share
// @desc    Validate if user can share specific files with conversation participants
// @access  Private
router.post('/validate-share', protect, async (req: AuthRequest, res, next) => {
    try {
        const { fileIds, conversationId } = req.body;

        if (!fileIds || !Array.isArray(fileIds) || !conversationId) {
            return res.status(400).json({ message: 'fileIds and conversationId are required' });
        }

        // Check if user has share permission
        const userRoles = await prismaAny.userRole.findMany({
            where: { userId: req.user!.id },
            include: { role: { include: { permissions: { include: { permission: true } } } } }
        });

        const permissions = new Set<string>(
            userRoles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.key))
        );

        if (!req.user!.isAdmin && !permissions.has('share_files')) {
            return res.status(403).json({
                message: 'No tienes permiso para compartir archivos',
                allowed: false
            });
        }

        // Get conversation participants
        const conversation = await prismaAny.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: true }
        });

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        const participantIds: string[] = conversation.participants.map((p: any) => p.userId);

        // Check which files the user owns or can access
        const files = await prismaAny.file.findMany({
            where: {
                id: { in: fileIds },
                OR: [
                    { ownerId: req.user!.id },
                    { folder: { ownerId: req.user!.id } }
                ]
            },
            select: { id: true, name: true, ownerId: true }
        });

        // Validate each file
        const validation = (fileIds as string[]).map((fileId: string) => {
            const file = files.find((f: any) => f.id === fileId);
            return {
                fileId,
                allowed: !!file,
                reason: file ? null : 'No tienes acceso a este archivo'
            };
        });

        res.json({
            allowed: validation.every(v => v.allowed),
            validation
        });
    } catch (err) {
        next(err);
    }
});

export default router;