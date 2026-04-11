import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import { createActivity } from './activity';

const router = express.Router();

const createSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  folderId: z.string().uuid().nullable().optional(),
  content: z.any().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  folderId: z.string().uuid().nullable().optional(),
  content: z.any().optional(),
  saveVersion: z.boolean().optional(),
});

const commentSchema = z.object({ text: z.string().min(1).max(5000), parentId: z.string().optional() });
const suggestionSchema = z.object({
  range: z.any().optional(),
  originalText: z.string().optional(),
  suggestedText: z.string().optional(),
  reason: z.string().optional(),
});
const accessSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  targetUsername: z.string().min(1).optional(),
  permission: z.enum(['read', 'edit', 'review', 'full']),
});

type AclPermission = 'read' | 'edit' | 'review' | 'full';
type AclEntry = { userId: string; permission: AclPermission; addedAt?: string; addedBy?: string };

const level: Record<AclPermission, number> = { read: 1, edit: 2, review: 3, full: 4 };

const readAcl = (content: any): AclEntry[] => {
  const acl = (content && typeof content === 'object' ? (content as any).__acl : null) || [];
  if (!Array.isArray(acl)) return [];
  return acl.filter((a) => a && typeof a.userId === 'string' && typeof a.permission === 'string');
};

const hasDocAccess = (req: AuthRequest, doc: { ownerId: string; content: any }, need: AclPermission = 'read') => {
  if (req.user.isAdmin || req.user.id === doc.ownerId) return true;
  const ownPermission = readAcl(doc.content).find((a) => a.userId === req.user.id)?.permission as AclPermission | undefined;
  if (!ownPermission) return false;
  return level[ownPermission] >= level[need];
};

const canAccess = (req: AuthRequest, doc: { ownerId: string; content: any }) => hasDocAccess(req, doc, 'read');
const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

router.get('/', protect, requirePermission('view_documents'), async (req: AuthRequest, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const folderId = req.query.folderId;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const whereBase: any = {};
    if (folderId === 'null') whereBase.folderId = null;
    else if (typeof folderId === 'string' && folderId.length > 0) whereBase.folderId = folderId;
    if (q.length >= 2) whereBase.title = { contains: q, mode: 'insensitive' };

    const [owned, others] = await Promise.all([
      prisma.document.findMany({
        where: { ...whereBase, ownerId: req.user.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, username: true, displayName: true } },
          lastModifiedBy: { select: { id: true, username: true, displayName: true } },
          folder: { select: { id: true, name: true } },
        },
      }),
      prisma.document.findMany({
        where: { ...whereBase, NOT: { ownerId: req.user.id } },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        include: {
          owner: { select: { id: true, username: true, displayName: true } },
          lastModifiedBy: { select: { id: true, username: true, displayName: true } },
          folder: { select: { id: true, name: true } },
        },
      }),
    ]);

    const shared = others.filter((doc) => hasDocAccess(req, doc as any, 'read'));
    const merged = [...owned, ...shared].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    const total = merged.length;
    const data = merged.slice((page - 1) * limit, page * limit);
    res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, requirePermission('create_documents'), async (req: AuthRequest, res, next) => {
  try {
    const { title, folderId, content } = createSchema.parse(req.body);
    const doc = await prisma.document.create({
      data: {
        title: title || 'Untitled document',
        folderId: folderId ?? null,
        content: content || { type: 'doc', content: [{ type: 'paragraph' }], __comments: [], __suggestions: [] },
        ownerId: req.user.id,
        lastModifiedById: req.user.id,
      },
    });
    await createActivity(req.user.id, 'document', 'create', doc.id, 'document', doc.title);
    res.status(201).json(doc);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
    next(error);
  }
});

router.get('/:id', protect, requirePermission('view_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(req, doc as any)) return res.status(403).json({ message: 'Not authorized' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, requirePermission('edit_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const payload = updateSchema.parse(req.body);
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, existing as any, 'edit')) return res.status(403).json({ message: 'Not authorized' });
    if (payload.saveVersion || payload.title !== undefined || payload.content !== undefined) {
      await prisma.documentVersion.create({ data: { documentId: existing.id, title: existing.title, content: existing.content as any } });
    }
    const updated = await prisma.document.update({
      where: { id: existing.id },
      data: {
        title: payload.title,
        folderId: payload.folderId,
        content: payload.content as any,
        lastModifiedById: req.user.id,
      },
    });
    await createActivity(req.user.id, 'document', 'edit', updated.id, 'document', updated.title);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
    next(error);
  }
});

router.delete('/:id', protect, requirePermission('delete_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, existing as any, 'full')) return res.status(403).json({ message: 'Not authorized' });
    await prisma.document.delete({ where: { id: existing.id } });
    await createActivity(req.user.id, 'document', 'delete', existing.id, 'document', existing.title);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/versions', protect, requirePermission('view_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(req, doc as any)) return res.status(403).json({ message: 'Not authorized' });
    const versions = await prisma.documentVersion.findMany({ where: { documentId: doc.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore/:versionId', protect, requirePermission('edit_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const versionId = String(req.params.versionId);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, doc as any, 'edit')) return res.status(403).json({ message: 'Not authorized' });
    const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== doc.id) return res.status(404).json({ message: 'Version not found' });
    await prisma.documentVersion.create({ data: { documentId: doc.id, title: doc.title, content: doc.content as any } });
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { title: version.title, content: version.content as any, lastModifiedById: req.user.id },
    });
    await createActivity(req.user.id, 'document', 'restore', updated.id, 'document', updated.title);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', protect, requirePermission('comment_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { text, parentId } = commentSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, doc as any, 'edit')) return res.status(403).json({ message: 'Not authorized' });
    const content = (doc.content || {}) as Record<string, any>;
    const comments = Array.isArray(content.__comments) ? content.__comments : [];
    const comment = {
      id: randomId('c'),
      parentId: parentId || null,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
      createdBy: { id: req.user.id, username: req.user.username, displayName: req.user.displayName },
    };
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __comments: [...comments, comment] } as any, lastModifiedById: req.user.id },
    });
    res.json({ comments: (updated.content as any).__comments || [] });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
    next(error);
  }
});

router.patch('/:id/comments/:commentId/resolve', protect, requirePermission('comment_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, doc as any, 'review')) return res.status(403).json({ message: 'Not authorized' });
    const content = (doc.content || {}) as Record<string, any>;
    const comments = Array.isArray(content.__comments) ? content.__comments : [];
    const updatedComments = comments.map((c: any) =>
      c.id === commentId ? { ...c, resolved: true, resolvedBy: req.user.id, resolvedAt: new Date().toISOString() } : c
    );
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __comments: updatedComments } as any, lastModifiedById: req.user.id },
    });
    res.json({ comments: (updated.content as any).__comments || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/suggestions', protect, requirePermission('review_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const payload = suggestionSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!hasDocAccess(req, doc as any, 'review')) return res.status(403).json({ message: 'Not authorized' });
    const content = (doc.content || {}) as Record<string, any>;
    const suggestions = Array.isArray(content.__suggestions) ? content.__suggestions : [];
    const suggestion = {
      id: randomId('s'),
      ...payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: { id: req.user.id, username: req.user.username, displayName: req.user.displayName },
    };
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __suggestions: [...suggestions, suggestion] } as any, lastModifiedById: req.user.id },
    });
    res.json({ suggestions: (updated.content as any).__suggestions || [] });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
    next(error);
  }
});

router.patch('/:id/suggestions/:suggestionId', protect, requirePermission('review_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const suggestionId = String(req.params.suggestionId);
    const action = String(req.body?.action || '');
    if (!['accept', 'reject'].includes(action)) return res.status(400).json({ message: 'Invalid action' });
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(req, doc as any)) return res.status(403).json({ message: 'Not authorized' });
    const content = (doc.content || {}) as Record<string, any>;
    const suggestions = Array.isArray(content.__suggestions) ? content.__suggestions : [];
    const updatedSuggestions = suggestions.map((s: any) =>
      s.id === suggestionId
        ? { ...s, status: action === 'accept' ? 'accepted' : 'rejected', reviewedBy: req.user.id, reviewedAt: new Date().toISOString() }
        : s
    );
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __suggestions: updatedSuggestions } as any, lastModifiedById: req.user.id },
    });
    res.json({ suggestions: (updated.content as any).__suggestions || [] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/access', protect, requirePermission('view_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(req, doc as any)) return res.status(403).json({ message: 'Not authorized' });
    const acl = readAcl(doc.content);
    const users = await prisma.user.findMany({
      where: { id: { in: acl.map((a) => a.userId) } },
      select: { id: true, username: true, displayName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      access: acl.map((a) => ({
        ...a,
        user: byId.get(a.userId) || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/access', protect, requirePermission('share_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { targetUserId, targetUsername, permission } = accessSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!(req.user.isAdmin || req.user.id === doc.ownerId || hasDocAccess(req, doc as any, 'full'))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const target = targetUserId
      ? await prisma.user.findUnique({ where: { id: targetUserId } })
      : await prisma.user.findFirst({ where: { username: targetUsername } });
    if (!target || !target.isActive) return res.status(404).json({ message: 'Target user not found' });
    if (target.id === doc.ownerId) return res.status(400).json({ message: 'Owner already has full access' });

    const content = (doc.content || {}) as Record<string, any>;
    const acl = readAcl(content).filter((a) => a.userId !== target.id);
    const updatedAcl: AclEntry[] = [...acl, { userId: target.id, permission, addedAt: new Date().toISOString(), addedBy: req.user.id }];
    await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __acl: updatedAcl } as any, lastModifiedById: req.user.id },
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: (error as any).errors });
    next(error);
  }
});

router.delete('/:id/access/:userId', protect, requirePermission('share_documents'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const userId = String(req.params.userId);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!(req.user.isAdmin || req.user.id === doc.ownerId || hasDocAccess(req, doc as any, 'full'))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const content = (doc.content || {}) as Record<string, any>;
    const acl = readAcl(content).filter((a) => a.userId !== userId);
    await prisma.document.update({
      where: { id: doc.id },
      data: { content: { ...content, __acl: acl } as any, lastModifiedById: req.user.id },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
