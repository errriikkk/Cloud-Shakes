import { Server, Socket } from 'socket.io';
import crypto from 'crypto';

interface CallParticipant {
    id: string;
    username: string;
    micEnabled: boolean;
    camEnabled: boolean;
    screenSharing: boolean;
    isAdmin: boolean;
    avatarColor?: string;
    avatarText?: string;
}

interface RoomState {
    roomId: string;
    participants: Map<string, CallParticipant>;
    adminId: string;
    password?: string;
    createdAt: number;
    lastActivity: number;
}

const rooms = new Map<string, RoomState>();

// Rate limiting: track join attempts per IP
const joinAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_JOIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_PARTICIPANTS_PER_ROOM = parseInt(process.env.MAX_CALL_PARTICIPANTS || '10');
const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Periodically clean up expired rooms
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, roomId) => {
        if (room.lastActivity && now - room.lastActivity > ROOM_EXPIRY_MS) {
            rooms.delete(roomId);
            console.log(`[TALK] Room ${roomId} expired and removed`);
        }
    });
}, 60 * 60 * 1000); // Check every hour

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = joinAttempts.get(ip);
    if (!entry || now > entry.resetTime) {
        joinAttempts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return false;
    }
    entry.count++;
    return entry.count > MAX_JOIN_ATTEMPTS;
}

export const setupCallHandlers = (io: Server) => {
    io.on('connection', (socket: Socket) => {
        console.log(`📡 New connection: ${socket.id}`);

        socket.on('check-room', (roomId: string, callback: (data: { exists: boolean, needsPassword: boolean }) => void) => {
            const room = rooms.get(roomId);
            if (room) {
                callback({ exists: true, needsPassword: !!room.password });
            } else {
                callback({ exists: false, needsPassword: false });
            }
        });

        socket.on('join-room', ({ roomId, username, isAdmin, password, avatarColor, avatarText }: { roomId: string, username: string, isAdmin: boolean, password?: string, avatarColor?: string, avatarText?: string }) => {
            // Rate limiting check
            const clientIp = socket.handshake.address;
            if (isRateLimited(clientIp)) {
                socket.emit('error', 'Too many join attempts. Please wait before trying again.');
                return;
            }

            if (rooms.has(roomId)) {
                const room = rooms.get(roomId)!;
                if (room.password && room.password !== password) {
                    socket.emit('error', 'Incorrect password');
                    return;
                }
                // Check max participants
                if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
                    socket.emit('error', `Room is full (max ${MAX_PARTICIPANTS_PER_ROOM} participants)`);
                    return;
                }
                room.lastActivity = Date.now();
            } else {
                rooms.set(roomId, {
                    roomId,
                    participants: new Map(),
                    adminId: isAdmin ? socket.id : '',
                    password: password || undefined,
                    createdAt: Date.now(),
                    lastActivity: Date.now()
                });
            }

            const room = rooms.get(roomId)!;
            socket.join(roomId);

            const participant: CallParticipant = {
                id: socket.id,
                username,
                micEnabled: true,
                camEnabled: false,
                screenSharing: false,
                isAdmin: isAdmin || room.adminId === socket.id,
                avatarColor,
                avatarText
            };

            if (participant.isAdmin && !room.adminId) {
                room.adminId = socket.id;
            }

            room.participants.set(socket.id, participant);

            // Notify others in room
            socket.to(roomId).emit('user-connected', participant);

            // Send current participant list to the new user
            socket.emit('room-users', Array.from(room.participants.values()));

            console.log(`👤 ${username} joined room ${roomId}`);
        });

        socket.on('signal', ({ to, signal, from }: { to: string, signal: any, from: string }) => {
            io.to(to).emit('signal', { signal, from });
        });

        socket.on('toggle-audio', ({ roomId, enabled }: { roomId: string, enabled: boolean }) => {
            const room = rooms.get(roomId);
            if (room && room.participants.has(socket.id)) {
                room.participants.get(socket.id)!.micEnabled = enabled;
                io.to(roomId).emit('user-audio-toggled', { userId: socket.id, enabled });
            }
        });

        socket.on('toggle-video', ({ roomId, enabled }: { roomId: string, enabled: boolean }) => {
            const room = rooms.get(roomId);
            if (room && room.participants.has(socket.id)) {
                room.participants.get(socket.id)!.camEnabled = enabled;
                io.to(roomId).emit('user-video-toggled', { userId: socket.id, enabled });
            }
        });

        socket.on('toggle-screen-share', ({ roomId, enabled }: { roomId: string, enabled: boolean }) => {
            const room = rooms.get(roomId);
            if (room && room.participants.has(socket.id)) {
                room.participants.get(socket.id)!.screenSharing = enabled;
                io.to(roomId).emit('user-screen-toggled', { userId: socket.id, enabled });
            }
        });

        // Admin Controls
        socket.on('admin:mute-user', ({ roomId, userId }: { roomId: string, userId: string }) => {
            const room = rooms.get(roomId);
            if (room && room.adminId === socket.id) {
                io.to(userId).emit('admin:force-mute');
                console.log(`👮 Admin muted ${userId} in ${roomId}`);
            }
        });

        socket.on('admin:kick-user', ({ roomId, userId }: { roomId: string, userId: string }) => {
            const room = rooms.get(roomId);
            if (room && room.adminId === socket.id) {
                io.to(userId).emit('admin:force-kick');
                const kickedSocket = io.sockets.sockets.get(userId);
                if (kickedSocket) kickedSocket.leave(roomId);
                room.participants.delete(userId);
                io.to(roomId).emit('user-disconnected', userId);
                console.log(`👮 Admin kicked ${userId} from ${roomId}`);
            }
        });

        // Chat
        socket.on('send-chat-message', (data: { roomId: string, message: string, user: string, timestamp: number }) => {
            const room = rooms.get(data.roomId);
            if (room && room.participants.has(socket.id)) {
                // Return full chat object
                io.to(data.roomId).emit('receive-chat-message', {
                    id: crypto.randomUUID(),
                    userId: socket.id,
                    user: data.user,
                    message: data.message,
                    timestamp: data.timestamp
                });
            }
        });

        socket.on('disconnecting', () => {
            socket.rooms.forEach(roomId => {
                const room = rooms.get(roomId);
                if (room) {
                    room.participants.delete(socket.id);
                    socket.to(roomId).emit('user-disconnected', socket.id);

                    if (room.participants.size === 0) {
                        rooms.delete(roomId);
                    } else if (room.adminId === socket.id) {
                        // Transfer admin to someone else
                        const nextAdmin = room.participants.keys().next().value;
                        if (nextAdmin) {
                            room.adminId = nextAdmin;
                            room.participants.get(nextAdmin)!.isAdmin = true;
                            io.to(roomId).emit('admin-changed', nextAdmin);
                        }
                    }
                }
            });
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Disconnected: ${socket.id}`);
        });
    });
};

export const getActiveRooms = () => {
    const activeRooms: any[] = [];
    rooms.forEach((room) => {
        activeRooms.push({
            roomId: room.roomId,
            participantCount: room.participants.size,
            createdAt: room.createdAt,
            needsPassword: !!room.password
        });
    });
    return activeRooms;
};
