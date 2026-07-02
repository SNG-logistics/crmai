import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: [] });

const msgs = await prisma.message.findMany({
  where: { type: 'image' },
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, metadata: true, platformMsgId: true, createdAt: true }
});

console.log(JSON.stringify(msgs, null, 2));
await prisma.$disconnect();
