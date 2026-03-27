import { useAuth } from "@/context/AuthContext";

export function usePermission() {
    const { user } = useAuth();

    const hasPermission = (permission: string): boolean => {
        if (!user) return false;
        if (user.isAdmin) return true;
        return user.permissions?.includes(permission) || false;
    };

    const hasAnyPermission = (permissions: string[]): boolean => {
        if (!user) return false;
        if (user.isAdmin) return true;
        return permissions.some(p => user.permissions?.includes(p));
    };

    // Files
    const canViewFiles = () => hasPermission('view_files');
    const canUpload = () => hasPermission('upload_files');
    const canDeleteFiles = () => hasPermission('delete_files');
    const canDownload = () => hasPermission('download_files');
    const canShare = () => hasPermission('share_files');
    
    // Folders
    const canViewFolders = () => hasPermission('view_folders');
    const canCreateFolders = () => hasPermission('create_folders');
    const canDeleteFolders = () => hasPermission('delete_folders');
    
    // Notes
    const canViewNotes = () => hasPermission('view_notes');
    const canCreateNotes = () => hasPermission('create_notes');
    const canEditNotes = () => hasPermission('edit_notes');
    const canDeleteNotes = () => hasPermission('delete_notes');
    
    // Calendar
    const canViewCalendar = () => hasPermission('view_calendar');
    const canCreateEvents = () => hasPermission('create_events');
    const canEditEvents = () => hasPermission('edit_events');
    const canDeleteEvents = () => hasPermission('delete_events');
    
    // Links
    const canViewLinks = () => hasPermission('view_links');
    const canCreateLinks = () => hasPermission('create_links');
    const canDeleteLinks = () => hasPermission('delete_links');
    
    // Gallery
    const canViewGallery = () => hasPermission('view_gallery');
    const canUploadImages = () => hasPermission('upload_images');
    const canDeleteImages = () => hasPermission('delete_images');
    
    // Chat
    const canViewChat = () => hasPermission('view_chat');
    const canSendMessages = () => hasPermission('send_messages');
    const canEditMessages = () => hasPermission('edit_messages');
    const canDeleteMessages = () => hasPermission('delete_messages');
    const canCreateChats = () => hasPermission('create_chats');
    const canCreateGroupChats = () => hasPermission('create_group_chats');
    const canManageGroupChats = () => hasPermission('manage_group_chats');
    const canDeleteConversations = () => hasPermission('delete_conversations');
    const canMentionUsers = () => hasPermission('mention_users');
    const canSendAttachments = () => hasPermission('send_attachments');
    
    // API Builder
    const canViewAPIBuilder = () => hasPermission('view_api_builder');
    const canCreateAPIs = () => hasPermission('create_apis');
    const canEditAPIs = () => hasPermission('edit_apis');
    const canDeleteAPIs = () => hasPermission('delete_apis');
    const canDeployAPIs = () => hasPermission('deploy_apis');
    
    // Calls
    const canViewCalls = () => hasPermission('view_calls');
    const canCreateCalls = () => hasPermission('create_calls');
    const canManageCalls = () => hasPermission('manage_calls');
    const canJoinCalls = () => hasPermission('join_calls');
    
    // Statistics
    const canViewStats = () => hasPermission('view_statistics');
    const canExportStats = () => hasPermission('export_statistics');
    
    // Settings
    const canViewSettings = () => hasPermission('view_settings');
    const canManageSettings = () => hasPermission('manage_settings');
    const canManageIntegrations = () => hasPermission('manage_integrations');
    
    // Users & Roles
    const canManageUsers = () => hasPermission('manage_users');
    const canManageRoles = () => hasPermission('manage_roles');
    
    // Activity
    const canViewActivity = () => hasPermission('view_activity');
    const canExportActivity = () => hasPermission('export_activity');

    return {
        hasPermission,
        hasAnyPermission,
        // Files
        canViewFiles,
        canUpload,
        canDeleteFiles,
        canDownload,
        canShare,
        // Folders
        canViewFolders,
        canCreateFolders,
        canDeleteFolders,
        // Notes
        canViewNotes,
        canCreateNotes,
        canEditNotes,
        canDeleteNotes,
        // Calendar
        canViewCalendar,
        canCreateEvents,
        canEditEvents,
        canDeleteEvents,
        // Links
        canViewLinks,
        canCreateLinks,
        canDeleteLinks,
        // Gallery
        canViewGallery,
        canUploadImages,
        canDeleteImages,
        // Chat
        canViewChat,
        canSendMessages,
        canEditMessages,
        canDeleteMessages,
        canCreateChats,
        canCreateGroupChats,
        canManageGroupChats,
        canDeleteConversations,
        canMentionUsers,
        canSendAttachments,
        // API Builder
        canViewAPIBuilder,
        canCreateAPIs,
        canEditAPIs,
        canDeleteAPIs,
        canDeployAPIs,
        // Calls
        canViewCalls,
        canCreateCalls,
        canManageCalls,
        canJoinCalls,
        // Statistics
        canViewStats,
        canExportStats,
        // Settings
        canViewSettings,
        canManageSettings,
        canManageIntegrations,
        // Users & Roles
        canManageUsers,
        canManageRoles,
        // Activity
        canViewActivity,
        canExportActivity,
    };
}
