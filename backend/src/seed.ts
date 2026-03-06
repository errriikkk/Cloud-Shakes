import prisma from './config/db';
import { hashPassword } from './utils/auth';

export const seedAdmin = async () => {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
        console.error(`[SEED ERROR] ADMIN_USERNAME and ADMIN_PASSWORD must be provided in the environment variables to seed the initial admin user.`);
        process.exit(1);
    }

    console.log(`[SEED] Checking admin user: ${adminUsername}`);

    try {
        const hashedPassword = await hashPassword(adminPassword);

        await prisma.user.upsert({
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

        console.log(`[SEED] Admin user "${adminUsername}" ensured with latest credentials.`);
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
