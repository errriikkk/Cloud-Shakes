import { useCallback, useRef, useEffect } from 'react';

const SFX_PATHS: Record<string, string> = {
    join: '/sfx/join.mp3',
    leave: '/sfx/leave.mp3',
    mute: '/sfx/mute.mp3',
    unmute: '/sfx/unmute.mp3',
    screenshare: '/sfx/screenshare.mp3',
    chat: '/sfx/chat.mp3',
};

export const useSFX = () => {
    const enabledRef = useRef(true);
    const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

    useEffect(() => {
        // Load setting from localStorage
        const stored = localStorage.getItem('talks_sfx_enabled');
        enabledRef.current = stored !== 'false';

        // Preload audio elements
        Object.entries(SFX_PATHS).forEach(([key, path]) => {
            const audio = new Audio(path);
            audio.volume = 0.4;
            audio.preload = 'auto';
            audioCache.current.set(key, audio);
        });
    }, []);

    const playSound = useCallback((name: string) => {
        if (!enabledRef.current) return;
        const audio = audioCache.current.get(name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => { /* ignore autoplay block */ });
        }
    }, []);

    const setEnabled = useCallback((enabled: boolean) => {
        enabledRef.current = enabled;
        localStorage.setItem('talks_sfx_enabled', String(enabled));
    }, []);

    const isEnabled = () => enabledRef.current;

    return { playSound, setEnabled, isEnabled };
};
