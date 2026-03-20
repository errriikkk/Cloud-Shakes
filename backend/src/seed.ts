import prisma from './config/db';
import { hashPassword } from './utils/auth';

const prismaAny = prisma as any;

// Sistema de permisos por herencia acumulativa
// Nivel 5: Owner > Nivel 4: Admin > Nivel 3: Editor > Nivel 2: Viewer > Nivel 1: Guest
const PERMISSIONS = {
    // Admin (Nivel 5 - Owner)
    'admin': 'Full administrative access',
    
    // Users Management (Nivel 4+)
    'manage_users': 'Invite, edit, and remove users',
    'manage_roles': 'Create and edit roles',
    
    // Files - Guest (Nivel 1)
    'view_shared_files': 'View files shared specifically with them',
    'preview_files': 'Preview files in browser',
    
    // Files - Viewer (Nivel 2)
    'view_files': 'View own files in storage',
    'download_files': 'Download own files',
    
    // Files - Editor (Nivel 3)
    'upload_files': 'Upload files to storage',
    'create_folders': 'Create new folders',
    'organize_folders': 'Move and organize folders',
    
    // Files - Admin (Nivel 4)
    'view_workspace_files': 'View ALL files in the workspace',
    'delete_files': 'Delete any files',
    'share_files': 'Share files externally',
    'delete_folders': 'Delete folders',
    
    // Documents - Viewer (Nivel 2)
    'view_documents': 'View documents',
    
    // Documents - Editor (Nivel 3)
    'create_documents': 'Create documents',
    'edit_documents': 'Edit documents',
    
    // Documents - Admin (Nivel 4)
    'delete_documents': 'Delete documents',
    
    // Notes - Viewer (Nivel 2)
    'view_notes': 'View notes',
    
    // Notes - Editor (Nivel 3)
    'create_notes': 'Create notes',
    'edit_notes': 'Edit notes',
    
    // Notes - Admin (Nivel 4)
    'delete_notes': 'Delete notes',
    
    // Calendar - Guest (Nivel 1)
    'view_calendar': 'View calendar events',
    
    // Calendar - Editor (Nivel 3)
    'create_events': 'Create calendar events',
    'edit_events': 'Edit calendar events',
    
    // Calendar - Admin (Nivel 4)
    'delete_events': 'Delete calendar events',
    
    // Links - Viewer (Nivel 2)
    'view_links': 'View shared links',
    
    // Links - Editor (Nivel 3)
    'create_links': 'Create share links',
    
    // Links - Admin (Nivel 4)
    'delete_links': 'Delete share links',
    
    // Gallery - Viewer (Nivel 2)
    'view_gallery': 'View gallery',
    
    // Gallery - Editor (Nivel 3)
    'upload_images': 'Upload images to gallery',
    
    // Gallery - Admin (Nivel 4)
    'delete_images': 'Delete gallery images',
    
    // Chat - Guest (Nivel 1)
    'view_chat': 'View chat and conversations',
    
    // Chat - Editor (Nivel 3)
    'send_messages': 'Send messages in chat',
    'edit_messages': 'Edit own messages',
    'create_chats': 'Create new conversations',
    'mention_users': 'Mention users in chat',
    'send_attachments': 'Send attachments in chat',
    'create_calls': 'Create videollamadas',
    'join_calls': 'Join videollamadas',
    
    // Chat - Admin (Nivel 4)
    'delete_messages': 'Delete own messages',
    'create_group_chats': 'Create group chats',
    'manage_group_chats': 'Manage group chats',
    'delete_conversations': 'Delete conversations',
    'manage_calls': 'Manage videollamadas',
    
    // API Builder - Editor (Nivel 3)
    'view_api_builder': 'View API builder',
    'create_apis': 'Create API endpoints',
    'edit_apis': 'Edit API endpoints',
    
    // API Builder - Admin (Nivel 4)
    'delete_apis': 'Delete API endpoints',
    'deploy_apis': 'Deploy APIs',
    
    // Statistics - Viewer (Nivel 2)
    'view_statistics': 'View usage statistics',
    
    // Statistics - Admin (Nivel 4)
    'export_statistics': 'Export statistics data',
    
    // Settings - Admin (Nivel 4)
    'view_settings': 'View settings page',
    'manage_settings': 'Manage system settings',
    'manage_integrations': 'Manage integrations',
    'manage_branding': 'Manage branding (name and logo)',
    
    // Activity - Admin (Nivel 4)
    'view_activity': 'View activity logs',
    'export_activity': 'Export activity logs',
    
    // Backups - Admin (Nivel 4)
    'manage_backups': 'Configure and run system backups',
    
    // File Renaming - Editor+ (Nivel 3+)
    'rename_files': 'Rename existing files'
};

// Colores por nivel: Owner=Purple, Admin=Azul, Editor=Teal, Viewer=Amber, Guest=Gris
const DEFAULT_ROLES = [
    {
        name: 'Owner',
        description: 'Dueño del workspace - Control total',
        color: '#8B5CF6', // Purple
        level: 5,
        isSystem: true,
        permissions: Object.keys(PERMISSIONS)
    },
    {
        name: 'Admin',
        description: 'Administrador - Gestión completa del workspace',
        color: '#3B82F6', // Azul
        level: 4,
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
            'manage_branding',
            'view_activity', 'export_activity',
            'manage_backups', 'rename_files'
        ]
    },
    {
        name: 'Editor',
        description: 'Editor - Crea y edita su propio contenido',
        color: '#14B8A6', // Teal
        level: 3,
        isSystem: true,
        permissions: [
            'view_files', 'upload_files', 'download_files', 'preview_files',
            'view_folders', 'create_folders', 'organize_folders',
            'view_documents', 'create_documents', 'edit_documents',
            'view_notes', 'create_notes', 'edit_notes',
            'view_calendar', 'create_events', 'edit_events',
            'view_links', 'create_links',
            'view_gallery', 'upload_images',
            'view_chat', 'send_messages', 'edit_messages', 'create_chats', 'mention_users', 'send_attachments',
            'view_api_builder', 'create_apis', 'edit_apis',
            'view_calls', 'create_calls', 'join_calls',
            'view_statistics', 'rename_files'
        ]
    },
    {
        name: 'Viewer',
        description: 'Viewer - Solo puede ver su propio contenido',
        color: '#F59E0B', // Amber
        level: 2,
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
        description: 'Invitado - Solo puede ver contenido compartido con él',
        color: '#6B7280', // Gris
        level: 1,
        isSystem: true,
        permissions: [
            'view_shared_files', 'preview_files',
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
                    level: roleData.level,
                    isSystem: roleData.isSystem
                }
            });
        } else {
            // Update existing role with level
            await prismaAny.role.update({
                where: { id: role.id },
                data: { level: roleData.level }
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
