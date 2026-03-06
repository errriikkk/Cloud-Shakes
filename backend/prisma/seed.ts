import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword';

    const existingAdmin = await prisma.user.findUnique({
        where: { username: adminUsername },
    });

    if (!existingAdmin) {
        const hashedPassword = await argon2.hash(adminPassword);
        await prisma.user.create({
            data: {
                username: adminUsername,
                password: hashedPassword,
                isAdmin: true,
            },
        });
        console.log(`✅ Admin user "${adminUsername}" seeded successfully.`);
    } else {
        console.log(`ℹ️  Admin user "${adminUsername}" already exists, skipping seed.`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
