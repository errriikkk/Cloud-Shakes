import { useRef, useState, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const turnServerUrl = process.env.NEXT_PUBLIC_TURN_URL || '';
const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME || '';
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY = 1000;

interface User {
    id: string;
    username: string;
    micEnabled: boolean;
    camEnabled: boolean;
    screenSharing: boolean;
    isAdmin: boolean;
    avatarColor?: string;
    avatarText?: string;
    stream?: MediaStream;
}

export interface ChatMessage {
    id: string;
    userId: string;
    user: string;
    message: string;
    timestamp: number;
}

export const useWebRTC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [localIsAdmin, setLocalIsAdmin] = useState(false);
    const [callState, setCallState] = useState<'idle' | 'connected' | 'kicked'>('idle');
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const makingOfferRef = useRef<Map<string, boolean>>(new Map());
    const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
    const streamsRef = useRef<Map<string, MediaStream>>(new Map());
    const configRef = useRef<{ roomId: string, username: string, isAdmin: boolean, password?: string, avatarColor?: string, avatarText?: string } | null>(null);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const streamSettingsRef = useRef<{
        videoQuality: string;
        noiseSuppression: boolean;
        echoCancellation: boolean;
        autoGainControl: boolean;
    }>({
        videoQuality: 'high',
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
    });
    const localStreamRef = useRef<MediaStream | null>(null);

    // 1. Sync ref for late joiners (WebRTC handlers need latest stream without re-binding)
    useEffect(() => {
        localStreamRef.current = localStream;

        // Pro-actively update all active peers when local stream changes
        if (localStream) {
            peersRef.current.forEach(pc => {
                localStream.getTracks().forEach(track => {
                    const senders = pc.getSenders();
                    const sender = senders.find(s => s.track?.kind === track.kind);
                    if (sender) {
                        if (sender.track !== track) sender.replaceTrack(track).catch(e => console.error("ReplaceTrack error:", e));
                    } else {
                        pc.addTrack(track, localStream);
                    }
                });
            });
        }
    }, [localStream]);

    // 2. Cleanup on unmount
    useEffect(() => {
        return () => {
            localStream?.getTracks().forEach(t => t.stop());
            socketRef.current?.disconnect();
            peersRef.current.forEach(pc => pc.close());
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, []);

    const getIceServers = () => {
        const servers: RTCIceServer[] = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];
        if (turnServerUrl) {
            servers.push({
                urls: turnServerUrl,
                username: turnUsername,
                credential: turnCredential,
            });
        }
        return servers;
    };

    const getVideoConstraints = (quality: string) => {
        const constraints: { width: number; height: number; frameRate?: number } = {
            width: 1280,
            height: 720,
            frameRate: 30
        };

        switch (quality) {
            case 'low':
                return { width: 640, height: 480, frameRate: 24 };
            case 'medium':
                return { width: 1280, height: 720, frameRate: 30 };
            case 'high':
                return { width: 1920, height: 1080, frameRate: 30 };
            case 'ultra':
                return { width: 2560, height: 1440, frameRate: 30 };
            default:
                return constraints;
        }
    };

    const createPeerConnection = useCallback((userId: string, stream: MediaStream | null) => {
        // Evitar crear conexiones duplicadas
        if (peersRef.current.has(userId)) {
            return peersRef.current.get(userId)!;
        }

        const pc = new RTCPeerConnection({
            iceServers: getIceServers()
        });

        const isPolite = socketRef.current?.id ? socketRef.current.id < userId : false;

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('signal', {
                    to: userId,
                    signal: { candidate: event.candidate },
                    from: socketRef.current.id
                });
            }
        };

        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            if (remoteStream) {
                // Clonar el stream para forzar render en React cuando se añaden/quitan tracks
                const newStream = new MediaStream(remoteStream.getTracks());
                streamsRef.current.set(userId, newStream);
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, stream: newStream } : u));

                // Asegurar que los tracks estén habilitados
                remoteStream.getTracks().forEach(track => {
                    track.enabled = true;
                });

                // Actualizar cuando cambian los tracks
                remoteStream.onaddtrack = () => {
                    const updatedStream = new MediaStream(remoteStream.getTracks());
                    streamsRef.current.set(userId, updatedStream);
                    setUsers(prev => prev.map(u => u.id === userId ? { ...u, stream: updatedStream } : u));
                };
            }
        };

        pc.onnegotiationneeded = async () => {
            // Evitar múltiples negociaciones simultáneas
            if (makingOfferRef.current.get(userId)) {
                return;
            }

            try {
                makingOfferRef.current.set(userId, true);

                // Esperar a que el estado sea estable
                if (pc.signalingState !== 'stable') {
                    return;
                }

                // Perfect Negotiation local description setup
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                if (socketRef.current && pc.localDescription) {
                    socketRef.current.emit('signal', {
                        to: userId,
                        signal: { sdp: pc.localDescription },
                        from: socketRef.current.id
                    });
                }
            } catch (err) {
                console.error('Negotiation error:', err);
            } finally {
                makingOfferRef.current.set(userId, false);
            }
        };

        pc.onsignalingstatechange = () => {
            if (pc.signalingState === 'stable') {
                makingOfferRef.current.set(userId, false);
            }
        };

        if (stream) {
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
        }

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state with ${userId}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                pc.restartIce();
            }
        };

        peersRef.current.set(userId, pc);
        return pc;
    }, []);

    const joinRoom = useCallback(async (roomId: string, username: string, isAdmin: boolean, password?: string, avatarColor?: string, avatarText?: string) => {
        // 1. Unlock audio context for iOS/Safari autoplay policy SYNCHRONOUSLY before awaits
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            // Play a tiny silent oscillator to unlock audio engine fully
            const osc = audioCtx.createOscillator();
            osc.connect(audioCtx.destination);
            osc.start(0);
            osc.stop(0.01);
            setTimeout(() => audioCtx.close(), 1000);
        } catch (_) { /* ignore */ }

        try {
            setError(null);
            setCallState('idle');
            setChatMessages([]);
            configRef.current = { roomId, username, isAdmin, password, avatarColor, avatarText };

            // 2. Camera OFF by default — only request audio
            let stream: MediaStream | null = null;
            const settings = streamSettingsRef.current;

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: settings.echoCancellation,
                        noiseSuppression: settings.noiseSuppression,
                        autoGainControl: settings.autoGainControl
                    },
                    video: false
                });
            } catch (aErr) {
                console.warn('No audio device available. Listening only.');
            }

            setLocalStream(stream);

            socketRef.current = io(socketUrl, {
                withCredentials: true,
                transports: ['websocket']
            });

            socketRef.current.on('connect', () => {
                socketRef.current?.emit('join-room', { roomId, username, isAdmin, password, avatarColor, avatarText });
            });

            socketRef.current.on('error', (msg: string) => {
                setError(msg);
                socketRef.current?.disconnect();
            });

            // Reconnection logic
            socketRef.current.on('disconnect', (reason: string) => {
                if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                    // Intentional disconnect, don't reconnect
                    return;
                }
                // Unexpected disconnect — try to reconnect
                if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS && configRef.current) {
                    const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current);
                    reconnectAttemptRef.current++;
                    console.log(`[WebRTC] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                    setError(`Connection lost. Reconnecting (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                    reconnectTimerRef.current = setTimeout(() => {
                        if (configRef.current) {
                            const { roomId, username, isAdmin, password } = configRef.current;
                            // Clean up old peers
                            peersRef.current.forEach(pc => pc.close());
                            peersRef.current.clear();
                            streamsRef.current.clear();
                            joinRoom(roomId, username, isAdmin, password);
                        }
                    }, delay);
                } else if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
                    setError('Connection lost. Please refresh the page to reconnect.');
                }
            });

            socketRef.current.on('connect', () => {
                reconnectAttemptRef.current = 0; // Reset on successful connection
            });

            socketRef.current.on('room-users', async (roomUsers: User[]) => {
                setIsConnected(true);
                setCallState('connected');
                const localUser = roomUsers.find(u => u.id === socketRef.current?.id);
                if (localUser) {
                    setLocalIsAdmin(localUser.isAdmin);
                }
                const otherUsers = roomUsers.filter(u => u.id !== socketRef.current?.id);
                setUsers(otherUsers);

                // Crear conexiones peer con todos los usuarios existentes
                for (const user of otherUsers) {
                    if (!peersRef.current.has(user.id)) {
                        const pc = createPeerConnection(user.id, localStreamRef.current);
                        // La negociación se iniciará automáticamente cuando se agreguen los tracks
                    }
                }
            });

            socketRef.current.on('admin-changed', (newAdminId: string) => {
                if (newAdminId === socketRef.current?.id) {
                    setLocalIsAdmin(true);
                } else {
                    setLocalIsAdmin(false);
                }
                setUsers(prev => prev.map(u =>
                    u.id === newAdminId ? { ...u, isAdmin: true } : { ...u, isAdmin: false }
                ));
            });

            socketRef.current.on('user-connected', async (user: User) => {
                setUsers(prev => {
                    // Evitar duplicados
                    if (prev.find(u => u.id === user.id)) {
                        return prev;
                    }
                    return [...prev, user];
                });

                if (!peersRef.current.has(user.id)) {
                    const pc = createPeerConnection(user.id, localStreamRef.current);
                    // La negociación se iniciará automáticamente cuando se agreguen los tracks
                }
            });

            socketRef.current.on('signal', async ({ signal, from }: { signal: any, from: string }) => {
                try {
                    let pc = peersRef.current.get(from);
                    if (!pc) {
                        pc = createPeerConnection(from, localStreamRef.current);
                    }

                    const isPolite = socketRef.current?.id ? socketRef.current.id < from : false;

                    if (signal.sdp) {
                        const description = new RTCSessionDescription(signal.sdp);
                        const offerCollision = description.type === 'offer' &&
                            (makingOfferRef.current.get(from) || pc.signalingState !== 'stable');

                        const ignoreOffer = !isPolite && offerCollision;
                        ignoreOfferRef.current.set(from, ignoreOffer);

                        if (ignoreOffer) return;

                        if (offerCollision) {
                            await Promise.all([
                                pc.setLocalDescription({ type: 'rollback' }),
                                pc.setRemoteDescription(description)
                            ]);
                        } else {
                            await pc.setRemoteDescription(description);
                        }

                        if (description.type === 'offer') {
                            await pc.setLocalDescription();
                            socketRef.current?.emit('signal', {
                                to: from,
                                signal: { sdp: pc.localDescription },
                                from: socketRef.current.id
                            });
                        }
                    } else if (signal.candidate) {
                        // Solo agregar candidatos si tenemos una descripción remota
                        if (pc.remoteDescription) {
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                            } catch (err) {
                                if (!ignoreOfferRef.current.get(from)) {
                                    console.error('Error adding ICE candidate:', err);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Signaling error:', err);
                }
            });

            socketRef.current.on('user-disconnected', (userId: string) => {
                const pc = peersRef.current.get(userId);
                pc?.close();
                peersRef.current.delete(userId);
                makingOfferRef.current.delete(userId);
                ignoreOfferRef.current.delete(userId);
                streamsRef.current.delete(userId);
                setUsers(prev => prev.filter(u => u.id !== userId));
            });

            // Server-synced state updates
            socketRef.current.on('user-audio-toggled', ({ userId, enabled }: { userId: string, enabled: boolean }) => {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, micEnabled: enabled } : u));
            });

            socketRef.current.on('user-video-toggled', ({ userId, enabled }: { userId: string, enabled: boolean }) => {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, camEnabled: enabled } : u));
            });

            socketRef.current.on('user-screen-toggled', ({ userId, enabled }: { userId: string, enabled: boolean }) => {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, screenSharing: enabled } : u));
            });

            socketRef.current.on('admin:force-mute', () => {
                stream?.getAudioTracks().forEach(t => t.enabled = false);
            });

            socketRef.current.on('admin:force-kick', () => {
                setCallState('kicked');
                // Clean up connections
                peersRef.current.forEach(pc => pc.close());
                peersRef.current.clear();
                streamsRef.current.clear();
                stream?.getTracks().forEach(t => t.stop());
                socketRef.current?.disconnect();
            });

            // Chat
            socketRef.current.on('receive-chat-message', (msg: ChatMessage) => {
                setChatMessages(prev => [...prev, msg]);
            });

        } catch (err) {
            console.error('Join error:', err);
            setError('Error al unirse');
        }
    }, [createPeerConnection]);

    const leaveRoom = useCallback(() => {
        localStream?.getTracks().forEach(t => t.stop());
        socketRef.current?.disconnect();
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        makingOfferRef.current.clear();
        ignoreOfferRef.current.clear();
        streamsRef.current.clear();
        setUsers([]);
        setLocalStream(null);
        setIsConnected(false);
    }, [localStream]);

    const shareScreen = async (options?: { audio?: boolean, video?: { width?: number, height?: number, frameRate?: number } }) => {
        try {
            const isNativeApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('CloudTalksDesktop');

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: options?.video || (isNativeApp
                    ? { width: 3840, height: 2160, frameRate: 60 } // Max quality for native app
                    : { width: 1920, height: 1080, frameRate: 60 }),
                audio: options?.audio !== false ? {
                    autoGainControl: false,
                    echoCancellation: false,
                    noiseSuppression: false,
                    sampleRate: isNativeApp ? 96000 : 48000,
                    channelCount: 2
                } : false
            });

            const screenTracks = screenStream.getTracks();
            const videoTrack = screenStream.getVideoTracks()[0];
            const hasAudio = screenStream.getAudioTracks().length > 0;

            // Add all screen tracks (video + audio if available) to peer connections
            peersRef.current.forEach(pc => {
                screenTracks.forEach(track => {
                    if (track.kind === 'video') {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(track);
                        else pc.addTrack(track, screenStream);
                    } else {
                        // For audio, ADD it alongside the existing mic track so both are heard
                        pc.addTrack(track, screenStream);
                    }
                });
            });

            // Notify server of screen share state
            socketRef.current?.emit('toggle-screen-share', { roomId: configRef.current?.roomId, enabled: true });

            // Update local stream keeping mic audio
            setLocalStream(prev => {
                if (!prev) return screenStream;
                const micTracks = prev.getAudioTracks().filter(t =>
                    !screenTracks.includes(t) &&
                    (t.label.toLowerCase().includes('mic') || !t.label)
                );
                return new MediaStream([...micTracks, ...screenTracks]);
            });

            videoTrack.onended = () => stopScreenShare();
        } catch (err: any) {
            if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                console.error('Screen share failed:', err);
            }
            throw err;
        }
    };

    const stopScreenShare = async () => {
        try {
            // Notify server
            socketRef.current?.emit('toggle-screen-share', { roomId: configRef.current?.roomId, enabled: false });

            const stream = await navigator.mediaDevices.getUserMedia({
                video: getVideoConstraints(streamSettingsRef.current.videoQuality)
            });
            const videoTrack = stream.getVideoTracks()[0];

            peersRef.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack);
            });

            setLocalStream(prev => {
                if (!prev) return stream;
                const micTracks = prev.getAudioTracks().filter(t =>
                    t.label.toLowerCase().includes('mic') || !t.label
                );
                return new MediaStream([...micTracks, videoTrack]);
            });
        } catch (err) {
            console.error('Stop share failed:', err);
        }
    };

    const toggleAudio = (enabled: boolean) => {
        localStream?.getAudioTracks().forEach(t => t.enabled = enabled);
        socketRef.current?.emit('toggle-audio', { roomId: configRef.current?.roomId, enabled });
    };

    const toggleVideo = (enabled: boolean) => {
        if (!enabled && localStream) {
            // Stop and release camera hardware
            localStream.getVideoTracks().forEach(t => {
                t.stop();
                localStream.removeTrack(t);
                peersRef.current.forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track === t);
                    if (sender) pc.removeTrack(sender);
                });
            });
            setLocalStream(new MediaStream(localStream.getAudioTracks()));
        } else if (enabled) {
            localStream?.getVideoTracks().forEach(t => t.enabled = enabled);
        }
        socketRef.current?.emit('toggle-video', { roomId: configRef.current?.roomId, enabled });
    };

    const adminMute = (userId: string) => {
        socketRef.current?.emit('admin:mute-user', { roomId: configRef.current?.roomId, userId });
    };

    const adminKick = (userId: string) => {
        socketRef.current?.emit('admin:kick-user', { roomId: configRef.current?.roomId, userId });
    };

    const sendChatMessage = (message: string) => {
        if (!configRef.current || !message.trim()) return;
        socketRef.current?.emit('send-chat-message', {
            roomId: configRef.current.roomId,
            message: message.trim(),
            user: configRef.current.username,
            timestamp: Date.now()
        });
    };

    // Enable camera on demand (camera privacy)
    const enableCamera = async () => {
        try {
            const isNativeApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('CloudTalksDesktop');
            const settings = streamSettingsRef.current;
            const videoConstraints = isNativeApp
                ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
                : getVideoConstraints(settings.videoQuality);

            const camStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            const videoTrack = camStream.getVideoTracks()[0];

            // Add track to all peers
            peersRef.current.forEach(pc => {
                pc.addTrack(videoTrack, camStream);
            });

            // Merge with current local stream
            setLocalStream(prev => {
                if (!prev) return camStream;
                prev.addTrack(videoTrack);
                return new MediaStream(prev.getTracks());
            });

            // Notify server
            socketRef.current?.emit('toggle-video', { roomId: configRef.current?.roomId, enabled: true });
            return true;
        } catch (err) {
            console.error('Failed to enable camera:', err);
            return false;
        }
    };

    const checkRoom = useCallback((roomId: string) => {
        return new Promise<{ exists: boolean, needsPassword: boolean }>((resolve) => {
            if (!socketRef.current) {
                socketRef.current = io(socketUrl, {
                    withCredentials: true,
                    transports: ['websocket']
                });
            }
            socketRef.current.emit('check-room', roomId, (data: { exists: boolean, needsPassword: boolean }) => {
                resolve(data);
            });
        });
    }, []);

    const updateStreamSettings = useCallback(async (settings: {
        videoQuality: string;
        noiseSuppression: boolean;
        echoCancellation: boolean;
        autoGainControl: boolean;
    }) => {
        streamSettingsRef.current = settings;

        if (!localStream) return;

        // Actualizar configuración de audio tracks
        localStream.getAudioTracks().forEach(track => {
            track.applyConstraints({
                echoCancellation: settings.echoCancellation,
                noiseSuppression: settings.noiseSuppression,
                autoGainControl: settings.autoGainControl
            }).catch(err => console.warn('Error applying audio constraints:', err));
        });

        // Actualizar configuración de video tracks
        const videoConstraints = getVideoConstraints(settings.videoQuality);
        localStream.getVideoTracks().forEach(track => {
            track.applyConstraints(videoConstraints).catch(err => console.warn('Error applying video constraints:', err));
        });

        // Actualizar tracks en todas las conexiones peer
        peersRef.current.forEach((pc) => {
            localStream.getTracks().forEach(track => {
                const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
                if (sender && sender.track !== track) {
                    sender.replaceTrack(track);
                }
            });
        });
    }, [localStream]);



    return {
        users, localStream, isConnected, localIsAdmin, callState, chatMessages, error,
        joinRoom, leaveRoom, shareScreen, toggleAudio, toggleVideo, adminMute, adminKick, checkRoom,
        updateStreamSettings, sendChatMessage, enableCamera
    };
};
