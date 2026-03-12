"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_ENDPOINTS } from "@/lib/api";

interface User {
    id: string;
    username: string;
    displayName: string;
    avatar?: string | null;
    avatarUrl?: string | null;
    isAdmin: boolean;
    storageLimit: string;
    permissions?: string[];
    roles?: string[];
}

interface AuthContextType {
    user: User | null;
    csrfToken: string | null;
    loading: boolean;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    csrfToken: null,
    loading: true,
    logout: () => { },
});

/**
 * Get CSRF token from cookie (fallback)
 */
function getCsrfTokenFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
    if (!match) {
        console.warn('[CSRF] No csrf-token cookie found');
        return null;
    }
    // Try to decode, but if it fails, use raw value
    try {
        const decoded = decodeURIComponent(match[1]);
        console.log('[CSRF] Token from cookie (first 10 chars):', decoded.substring(0, 10) + '...');
        return decoded;
    } catch {
        console.log('[CSRF] Token from cookie (raw, first 10 chars):', match[1].substring(0, 10) + '...');
        return match[1];
    }
}

let globalCsrfToken: string | null = null;

/**
 * Setup axios interceptors for CSRF token injection and automatic token refresh
 */
function setupAxiosInterceptors(onLogout: () => void, setCsrfToken: (token: string) => void) {
    // Request interceptor: attach CSRF token to mutating requests
    const requestInterceptor = axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const method = config.method?.toUpperCase();
        // Skip CSRF injection for auth endpoints (login, refresh) as they handle their own CSRF
        const isAuthEndpoint = config.url?.includes('/api/auth/login') || config.url?.includes('/api/auth/refresh');

        if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && !isAuthEndpoint) {
            // Always get fresh token from cookie to ensure it's up to date
            const token = globalCsrfToken || getCsrfTokenFromCookie();
            if (token && config.headers) {
                config.headers['X-CSRF-Token'] = token;
                console.log(`[CSRF] Header injected: Yes (${method} ${config.url})`);
            } else {
                console.warn(`[CSRF] Header NOT injected: No token found (${method} ${config.url})`);
            }
        }
        return config;
    });

    // Response interceptor: auto-refresh on 401
    let isRefreshing = false;
    let refreshQueue: Array<{
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        config: InternalAxiosRequestConfig;
    }> = [];

    const responseInterceptor = axios.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

            // Handle 403 CSRF errors - try to refresh token and retry
            const isCsrfError = error.response?.status === 403 &&
                ((error.response?.data as any)?.message?.includes('CSRF') ||
                    (error.response?.data as any)?.message?.includes('token'));

            if (
                isCsrfError &&
                !originalRequest._retry &&
                !originalRequest.url?.includes('/api/auth/login') &&
                !originalRequest.url?.includes('/api/auth/refresh')
            ) {
                if (isRefreshing) {
                    // Queue this request while refresh is in progress
                    return new Promise((resolve, reject) => {
                        refreshQueue.push({ resolve, reject, config: originalRequest });
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    console.log('[CSRF] 403 error detected, refreshing token...');
                    const res = await axios.post(API_ENDPOINTS.AUTH.REFRESH, {}, { withCredentials: true });
                    const newToken = res.data.csrfToken;
                    globalCsrfToken = newToken;
                    setCsrfToken(newToken);
                    console.log('[CSRF] Token refreshed, retrying request...');

                    // Retry all queued requests
                    refreshQueue.forEach(({ resolve, config }) => {
                        if (config.headers) {
                            config.headers['X-CSRF-Token'] = newToken;
                        }
                        resolve(axios(config));
                    });
                    refreshQueue = [];

                    // Update CSRF token on original request
                    if (originalRequest.headers) {
                        originalRequest.headers['X-CSRF-Token'] = newToken;
                    }

                    return axios(originalRequest);
                } catch (refreshError) {
                    // Refresh failed — logout
                    console.error('[CSRF] Token refresh failed:', refreshError);
                    refreshQueue.forEach(({ reject }) => reject(refreshError));
                    refreshQueue = [];
                    onLogout();
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            // Only handle 401 for non-auth endpoints (avoid infinite loop)
            if (
                error.response?.status === 401 &&
                !originalRequest._retry &&
                !originalRequest.url?.includes('/api/auth/login') &&
                !originalRequest.url?.includes('/api/auth/refresh')
            ) {
                if (isRefreshing) {
                    // Queue this request while refresh is in progress
                    return new Promise((resolve, reject) => {
                        refreshQueue.push({ resolve, reject, config: originalRequest });
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const res = await axios.post(API_ENDPOINTS.AUTH.REFRESH, {}, { withCredentials: true });
                    const newToken = res.data.csrfToken;
                    globalCsrfToken = newToken;
                    setCsrfToken(newToken);

                    // Retry all queued requests
                    refreshQueue.forEach(({ resolve, config }) => {
                        if (config.headers) {
                            config.headers['X-CSRF-Token'] = newToken;
                        }
                        resolve(axios(config));
                    });
                    refreshQueue = [];

                    // Update CSRF token on original request
                    if (originalRequest.headers) {
                        originalRequest.headers['X-CSRF-Token'] = newToken;
                    }

                    return axios(originalRequest);
                } catch (refreshError) {
                    // Refresh failed — logout
                    refreshQueue.forEach(({ reject }) => reject(refreshError));
                    refreshQueue = [];
                    onLogout();
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            return Promise.reject(error);
        }
    );

    return () => {
        axios.interceptors.request.eject(requestInterceptor);
        axios.interceptors.response.eject(responseInterceptor);
    };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    const interceptorsCleanup = useRef<(() => void) | null>(null);

    const logout = useCallback(async () => {
        try {
            await axios.post(API_ENDPOINTS.AUTH.LOGOUT, {}, {
                withCredentials: true,
            });
        } catch (err) {
            // Silently handle logout errors
        }
        setUser(null);
        setCsrfToken(null);
        globalCsrfToken = null;
        router.push("/");
    }, [router]);

    // Setup interceptors once
    useEffect(() => {
        interceptorsCleanup.current = setupAxiosInterceptors(() => {
            setUser(null);
            setCsrfToken(null);
            globalCsrfToken = null;
            if (window.location.pathname.startsWith("/dashboard") && !window.location.pathname.startsWith("/talk")) {
                router.push("/");
            }
        }, (token) => setCsrfToken(token));

        return () => {
            interceptorsCleanup.current?.();
        };
    }, [router]);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await axios.get(API_ENDPOINTS.AUTH.ME, {
                    withCredentials: true,
                });
                setUser(res.data);
                if (res.data.csrfToken) {
                    setCsrfToken(res.data.csrfToken);
                    globalCsrfToken = res.data.csrfToken;
                }
            } catch (err) {
                setUser(null);
                setCsrfToken(null);
                globalCsrfToken = null;
                // Solo redirigir si está en dashboard, no en talk (permite acceso anónimo)
                if (pathname.startsWith("/dashboard") && !pathname.startsWith("/talk")) {
                    router.push("/");
                }
            } finally {
                setLoading(false);
            }
        };

        if (!user) {
            checkAuth();
        }

        // Auto-refresh auth state when window regains focus to fetch new permissions/roles instantly
        const onFocus = () => {
            if (user) {
                checkAuth();
            }
        };

        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);

    }, [pathname, router]); // deliberately left 'user' out of deps so the focus event always references latest checkAuth

    return (
        <AuthContext.Provider value={{ user, csrfToken, loading, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
