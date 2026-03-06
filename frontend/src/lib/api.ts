const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.142:5000";

export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: `${API_URL}/api/auth/login`,
        LOGOUT: `${API_URL}/api/auth/logout`,
        ME: `${API_URL}/api/auth/me`,
        REFRESH: `${API_URL}/api/auth/refresh`,
    },
    FILES: {
        BASE: `${API_URL}/api/files`,
        UPLOAD: `${API_URL}/api/files/upload`,
        USAGE: `${API_URL}/api/files/usage`,
        DOWNLOAD: (id: string) => `${API_URL}/api/files/download/${id}`,
        DELETE: (id: string) => `${API_URL}/api/files/${id}`,
    },
    FOLDERS: {
        BASE: `${API_URL}/api/folders`,
        DETAIL: (id: string) => `${API_URL}/api/folders/${id}`,
    },
    LINKS: {
        BASE: `${API_URL}/api/links`,
        STATS: `${API_URL}/api/links/stats`,
        PUBLIC_INFO: (id: string) => `${API_URL}/api/links/public/${id}`,
        PUBLIC_DOWNLOAD: (id: string) => `${API_URL}/api/links/download/${id}`,
    },
    DOCUMENTS: {
        BASE: `${API_URL}/api/documents`,
        DETAIL: (id: string) => `${API_URL}/api/documents/${id}`,
    },
    NOTES: {
        BASE: `${API_URL}/api/notes`,
        DETAIL: (id: string) => `${API_URL}/api/notes/${id}`,
    },
    CALENDAR: {
        BASE: `${API_URL}/api/calendar`,
        DETAIL: (id: string) => `${API_URL}/api/calendar/${id}`,
    },
    PROFILE: {
        BASE: `${API_URL}/api/profile`,
        AVATAR: `${API_URL}/api/profile/avatar`,
    },
    ACTIVITY: {
        BASE: `${API_URL}/api/activity`,
    },
    CALENDAR: {
        BASE: `${API_URL}/api/calendar`,
        DETAIL: (id: string) => `${API_URL}/api/calendar/${id}`,
    },
};

export default API_URL;
