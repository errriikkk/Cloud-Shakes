import prisma from './config/db';

async function main() {
  await prisma.permission.upsert({
    where: { key: 'view_workspace_files' },
    update: {},
    create: {
      key: 'view_workspace_files',
      description: 'View all files in the workspace (shared cloud)'
    }
  });
  console.log('Permission added successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
