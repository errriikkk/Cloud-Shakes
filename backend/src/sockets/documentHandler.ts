import { Server, Socket } from 'socket.io';
import prisma from '../config/db';
import { verifyToken } from '../utils/auth';

type PresenceUser = { socketId: string; userId: string; username: string; displayName?: string; at: number };

const docPresence = new Map<string, Map<string, PresenceUser>>();
const docState = new Map<string, { title: string; content: any }>();
const level: Record<'read' | 'edit' | 'review' | 'full', number> = { read: 1, edit: 2, review: 3, full: 4 };
const readAcl = (content: any) => {
  const acl = (content && typeof content === 'object' ? (content as any).__acl : null) || [];
  return Array.isArray(acl) ? acl : [];
};

function readCookieToken(socket: Socket): string | null {
  const raw = socket.handshake.headers.cookie || '';
  const parts = raw.split(';').map((p) => p.trim());
  const entry = parts.find((p) => p.startsWith('token='));
  if (!entry) return null;
  return decodeURIComponent(entry.slice('token='.length));
}

async function authorizeDocumentJoin(socket: Socket, docId: string): Promise<{ ok: boolean; user?: any }> {
  const token = readCookieToken(socket);
  if (!token) return { ok: false };
  const decoded = verifyToken(token);
  if (!decoded?.id) return { ok: false };

  const dbUser = await prisma.user.findUnique({
    where: { id: decoded.id as string },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });
  if (!dbUser || !dbUser.isActive) return { ok: false };

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return { ok: false };

  const permissions = Array.from(new Set((dbUser.roles || []).flatMap((r: any) => r.role.permissions.map((p: any) => p.permission.key))));
  const canView = dbUser.isAdmin || permissions.includes('view_documents');
  const aclPermission = readAcl(doc.content).find((a: any) => a?.userId === dbUser.id)?.permission as ('read' | 'edit' | 'review' | 'full' | undefined);
  const canAccessOwnerDoc = dbUser.isAdmin || doc.ownerId === dbUser.id || (aclPermission ? level[aclPermission] >= level.read : false);

  if (!canView || !canAccessOwnerDoc) return { ok: false };
  return { ok: true, user: dbUser };
}

export const setupDocumentHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('doc:join', async ({ docId }: { docId: string }) => {
      if (!docId) return;
      const authz = await authorizeDocumentJoin(socket, docId);
      if (!authz.ok || !authz.user) {
        socket.emit('doc:error', { message: 'Unauthorized for document room' });
        return;
      }
      socket.join(`doc:${docId}`);

      const info: PresenceUser = {
        socketId: socket.id,
        userId: authz.user.id,
        username: authz.user.username || `user-${socket.id.slice(0, 6)}`,
        displayName: authz.user.displayName,
        at: Date.now(),
      };

      if (!docPresence.has(docId)) docPresence.set(docId, new Map());
      docPresence.get(docId)!.set(socket.id, info);
      io.to(`doc:${docId}`).emit('doc:presence', Array.from(docPresence.get(docId)!.values()));

      const state = docState.get(docId);
      if (state) socket.emit('doc:content', state);
    });

    socket.on('doc:content', ({ docId, content, title }: { docId: string; content: any; title: string }) => {
      if (!docId) return;
      docState.set(docId, { content, title });
      socket.to(`doc:${docId}`).emit('doc:content', { content, title });
    });

    socket.on('doc:leave', ({ docId }: { docId: string }) => {
      if (!docId || !docPresence.has(docId)) return;
      docPresence.get(docId)!.delete(socket.id);
      io.to(`doc:${docId}`).emit('doc:presence', Array.from(docPresence.get(docId)!.values()));
    });

    socket.on('disconnect', () => {
      for (const [docId, users] of docPresence.entries()) {
        if (users.delete(socket.id)) {
          io.to(`doc:${docId}`).emit('doc:presence', Array.from(users.values()));
        }
      }
    });
  });
};
