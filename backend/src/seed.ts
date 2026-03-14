import prisma from './config/db';
import { hashPassword } from './utils/auth';

const prismaAny = prisma as any;

// Discord-style permission categories
const PERMISSIONS = {
    // Admin
    'admin': 'Full administrative access',
    
    // Users Management
    'manage_users': 'Invite, edit, and remove users',
    'manage_roles': 'Create and edit roles',
    
    // Files
    'view_files': 'View files in storage',
    'view_workspace_files': 'View all files in the workspace (shared cloud)',
    'upload_files': 'Upload files to storage',
    'delete_files': 'Delete any files',
    'download_files': 'Download files',
    'share_files': 'Share files externally',
    'preview_files': 'Preview files in browser',
    
    // Folders
    'view_folders': 'View folders',
    'create_folders': 'Create new folders',
    'delete_folders': 'Delete folders',
    'organize_folders': 'Move and organize folders',
    
    // Documents
    'view_documents': 'View documents',
    'create_documents': 'Create documents',
    'edit_documents': 'Edit documents',
    'delete_documents': 'Delete documents',
    
    // Notes
    'view_notes': 'View notes',
    'create_notes': 'Create notes',
    'edit_notes': 'Edit notes',
    'delete_notes': 'Delete notes',
    
    // Calendar
    'view_calendar': 'View calendar events',
    'create_events': 'Create calendar events',
    'edit_events': 'Edit calendar events',
    'delete_events': 'Delete calendar events',
    
    // Links
    'view_links': 'View shared links',
    'create_links': 'Create share links',
    'delete_links': 'Delete share links',
    
    // Gallery
    'view_gallery': 'View gallery',
    'upload_images': 'Upload images to gallery',
    'delete_images': 'Delete gallery images',
    
    // Chat - Comprehensive permissions
    'view_chat': 'View chat and conversations',
    'send_messages': 'Send messages in chat',
    'edit_messages': 'Edit own messages',
    'delete_messages': 'Delete own messages',
    'create_chats': 'Create new conversations',
    'create_group_chats': 'Create group chats',
    'manage_group_chats': 'Manage group chats',
    'delete_conversations': 'Delete conversations',
    'mention_users': 'Mention users in chat',
    'send_attachments': 'Send attachments in chat',
    
    // API Builder
    'view_api_builder': 'View API builder',
    'create_apis': 'Create API endpoints',
    'edit_apis': 'Edit API endpoints',
    'delete_apis': 'Delete API endpoints',
    'deploy_apis': 'Deploy APIs',
    
    // Statistics
    'view_statistics': 'View usage statistics',
    'export_statistics': 'Export statistics data',
    
    // Settings
    'view_settings': 'View settings page',
    'manage_settings': 'Manage system settings',
    'manage_integrations': 'Manage integrations',
    
    // Activity
    'view_activity': 'View activity logs',
    'export_activity': 'Export activity logs'
};

const DEFAULT_ROLES = [
    {
        name: 'Owner',
        description: 'Dueño del workspace - Control total',
        color: '#ED4245',
        isSystem: true,
        permissions: Object.keys(PERMISSIONS)
    },
    {
        name: 'Admin',
        description: 'Administrador - Gestión completa',
        color: '#EB459E',
        isSystem: true,
        permissions: [
            'manage_users', 'manage_roles',
            'view_files', 'view_workspace_files', 'upload_files', 'delete_files', 'download_files', 'share_files', 'preview_files',
            'view_folders', 'create_folders', 'delete_folders', 'organize_folders',
            'view_documents', 'create_documents', 'edit_documents', 'delete_documents',
            'view_notes', 'create_notes', 'edit_notes', 'delete_notes',
            'view_calendar', 'create_events', 'edit_events', 'delete_events',
            'view_links', 'create_links', 'delete_links',
            'view_gallery', 'upload_images', 'delete_images',
            'view_chat', 'send_messages', 'edit_messages', 'delete_messages', 'create_chats', 'create_group_chats', 'manage_group_chats', 'delete_conversations', 'mention_users', 'send_attachments',
            'view_api_builder', 'create_apis', 'edit_apis', 'delete_apis', 'deploy_apis',
            'view_calls', 'create_calls', 'manage_calls', 'join_calls',
            'view_statistics', 'export_statistics',
            'view_settings', 'manage_settings', 'manage_integrations',
            'view_activity', 'export_activity'
        ]
    },
    {
        name: 'Moderator',
        description: 'Moderador - Gestión de contenido',
        color: '#FEE75C',
        isSystem: true,
        permissions: [
            'view_files', 'view_workspace_files', 'upload_files', 'delete_files', 'download_files', 'share_files', 'preview_files',
            'view_folders', 'create_folders', 'delete_folders', 'organize_folders',
            'view_documents', 'create_documents', 'edit_documents', 'delete_documents',
            'view_notes', 'create_notes', 'edit_notes', 'delete_notes',
            'view_calendar', 'create_events', 'edit_events', 'delete_events',
            'view_links', 'create_links', 'delete_links',
            'view_gallery', 'upload_images', 'delete_images',
            'view_chat', 'send_messages', 'edit_messages', 'delete_messages', 'create_chats', 'mention_users',
            'view_statistics',
            'view_activity'
        ]
    },
    {
        name: 'Editor',
        description: 'Editor - Puede crear y editar contenido',
        color: '#57F287',
        isSystem: true,
        permissions: [
            'view_files', 'upload_files', 'download_files', 'share_files', 'preview_files',
            'view_folders', 'create_folders', 'organize_folders',
            'view_documents', 'create_documents', 'edit_documents',
            'view_notes', 'create_notes', 'edit_notes',
            'view_calendar', 'create_events', 'edit_events',
            'view_links', 'create_links',
            'view_gallery', 'upload_images',
            'view_chat', 'send_messages', 'edit_messages', 'create_chats', 'mention_users',
            'view_api_builder', 'create_apis', 'edit_apis',
            'view_calls', 'create_calls', 'join_calls'
        ]
    },
    {
        name: 'Uploader',
        description: 'Uploader - Solo puede subir archivos',
        color: '#9B59B6',
        isSystem: true,
        permissions: [
            'view_files', 'upload_files', 'preview_files',
            'view_folders', 'create_folders',
            'view_notes', 'create_notes',
            'view_calendar', 'create_events',
            'view_gallery', 'upload_images',
            'view_chat', 'send_messages'
        ]
    },
    {
        name: 'Viewer',
        description: 'Visor - Solo puede ver contenido',
        color: '#7289DA',
        isSystem: true,
        permissions: [
            'view_files', 'download_files', 'preview_files',
            'view_folders',
            'view_documents',
            'view_notes',
            'view_calendar',
            'view_links',
            'view_gallery',
            'view_chat',
            'view_statistics'
        ]
    },
    {
        name: 'Guest',
        description: 'Invitado - Acceso mínimo',
        color: '#95A5A6',
        isSystem: true,
        permissions: [
            'view_files', 'preview_files',
            'view_calendar',
            'view_chat'
        ]
    }
];

export const seedRolesAndPermissions = async () => {
    console.log('[SEED] Creating roles and permissions...');
    
    // Create permissions
    const permissionKeys = Object.keys(PERMISSIONS);
    for (const key of permissionKeys) {
        await prismaAny.permission.upsert({
            where: { key },
            update: {},
            create: { key, description: PERMISSIONS[key as keyof typeof PERMISSIONS] }
        });
    }
    console.log(`[SEED] Created ${permissionKeys.length} permissions`);

    // Create roles with permissions
    for (const roleData of DEFAULT_ROLES) {
        // Check if role exists
        let role = await prismaAny.role.findFirst({
            where: { name: roleData.name }
        });

        if (!role) {
            role = await prismaAny.role.create({
                data: {
                    name: roleData.name,
                    description: roleData.description,
                    color: roleData.color,
                    isSystem: roleData.isSystem
                }
            });
        }

        // Get permission IDs
        const permissions = await prismaAny.permission.findMany({
            where: { key: { in: roleData.permissions } }
        });

        // Clear existing and assign new permissions
        await prismaAny.rolePermission.deleteMany({ where: { roleId: role.id } });
        
        await prismaAny.rolePermission.createMany({
            data: permissions.map((p: any) => ({
                roleId: role.id,
                permissionId: p.id
            }))
        });

        console.log(`[SEED] Created role "${role.name}" with ${permissions.length} permissions`);
    }
};

export const seedAdmin = async () => {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
        console.error(`[SEED ERROR] ADMIN_USERNAME and ADMIN_PASSWORD must be provided in the environment variables to seed the initial admin user.`);
        process.exit(1);
    }

    console.log(`[SEED] Checking admin user: ${adminUsername}`);

    try {
        // First seed roles and permissions
        await seedRolesAndPermissions();

        // Get Admin role
        const adminRole = await prismaAny.role.findFirst({
            where: { name: 'Admin' }
        });

        if (!adminRole) {
            console.error('[SEED ERROR] Admin role not found!');
            return;
        }

        const hashedPassword = await hashPassword(adminPassword);

        const user = await prisma.user.upsert({
            where: { username: adminUsername },
            update: {
                password: hashedPassword,
                isAdmin: true
            },
            create: {
                username: adminUsername,
                password: hashedPassword,
                displayName: adminUsername,
                isAdmin: true,
            },
        });

        // Assign admin role to user
        await prismaAny.userRole.upsert({
            where: {
                userId_roleId: {
                    userId: user.id,
                    roleId: adminRole.id
                }
            },
            update: {},
            create: {
                userId: user.id,
                roleId: adminRole.id
            }
        });

        console.log(`[SEED] Admin user "${adminUsername}" created with Admin role and all permissions.`);
    } catch (error) {
        console.error(`[SEED] Failed to seed admin user:`, error);
    }
};

// Only run if called directly
if (require.main === module) {
    seedAdmin()
        .catch((e) => {
            console.error(e);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
