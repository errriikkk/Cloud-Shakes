const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.permission.findUnique({
  where: { key: 'view_workspace_files' }
}).then(r => {
  console.log(JSON.stringify(r));
  prisma.$disconnect();
});
