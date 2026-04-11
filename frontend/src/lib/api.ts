const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || "https://cdn.shakes.es";

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
    NOTES: {
        BASE: `${API_URL}/api/notes`,
        DETAIL: (id: string) => `${API_URL}/api/notes/${id}`,
    },
    DOCUMENTS: {
        BASE: `${API_URL}/api/documents`,
        DETAIL: (id: string) => `${API_URL}/api/documents/${id}`,
        VERSIONS: (id: string) => `${API_URL}/api/documents/${id}/versions`,
        RESTORE: (id: string, versionId: string) => `${API_URL}/api/documents/${id}/restore/${versionId}`,
        ACCESS: (id: string) => `${API_URL}/api/documents/${id}/access`,
        ACCESS_USER: (id: string, userId: string) => `${API_URL}/api/documents/${id}/access/${userId}`,
        COMMENTS: (id: string) => `${API_URL}/api/documents/${id}/comments`,
        RESOLVE_COMMENT: (id: string, commentId: string) => `${API_URL}/api/documents/${id}/comments/${commentId}/resolve`,
        SUGGESTIONS: (id: string) => `${API_URL}/api/documents/${id}/suggestions`,
        REVIEW_SUGGESTION: (id: string, suggestionId: string) => `${API_URL}/api/documents/${id}/suggestions/${suggestionId}`,
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
    CLOUD_SETTINGS: {
        BASE: `${API_URL}/api/cloud-settings`,
    },
    IAM: {
        USERS: `${API_URL}/api/users`,
        ROLES: `${API_URL}/api/roles`,
        TEAM_INVITATIONS: `${API_URL}/api/team/invitations`,
        ACCEPT_INVITATION: `${API_URL}/api/team/invitations/accept`,
        INVITE_INFO: (token: string) => `${API_URL}/api/team/invitations/info/${token}`,
    },
    CHAT: {
        BASE: `${API_URL}/api/chat`,
        CONVERSATIONS: `${API_URL}/api/chat/conversations`,
        USERS: `${API_URL}/api/chat/users`,
        STATUS: `${API_URL}/api/chat/status`,
        CONVERSATION_MESSAGES: (id: string) => `${API_URL}/api/chat/conversations/${id}/messages`,
        CONVERSATION_DETAIL: (id: string) => `${API_URL}/api/chat/conversations/${id}`,
        MESSAGE: (id: string) => `${API_URL}/api/chat/messages/${id}`,
        SEARCH_MENTIONS: `${API_URL}/api/chat/search-mentions`,
        VALIDATE_SHARE: `${API_URL}/api/chat/validate-share`,
    },
    PLUGINS: {
        // Discovery / Marketplace (CDN)
        BASE: `${CDN_URL}/api/plugins`,
        
        // Configuration / Local Management (Local Backend)
        INSTALLED: `${API_URL}/api/plugins/installed`,
        SIDEBAR: `${API_URL}/api/plugins/sidebar`,
        INSTALL: `${API_URL}/api/plugins/install`,
        RUN: `${API_URL}/api/plugins/run`,
        UNINSTALL: `${API_URL}/api/plugins/uninstall`,
        LOGS: `${API_URL}/api/plugins/logs`,
        PAGE: (name: string) => `${API_URL}/api/plugins/page/${name}`,
        
        UPLOAD_ZIP: `${API_URL}/api/plugins/upload-zip`,
        
        // Instance-based management
        INSTANCE_INSTALLED: (instanceId: string) => `${API_URL}/api/plugins/i/${instanceId}`,
        INSTANCE_INSTALL: (instanceId: string) => `${API_URL}/api/plugins/i/${instanceId}/install`,
        INSTANCE_UNINSTALL: (instanceId: string) => `${API_URL}/api/plugins/i/${instanceId}/uninstall`,
    },
};

export default API_URL;
