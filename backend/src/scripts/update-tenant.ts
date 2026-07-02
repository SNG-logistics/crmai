// update-tenant.ts — รันใน terminal ของ backend
// npx ts-node src/scripts/update-tenant.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ค้นหา tenant เดิมก่อน
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, isActive: true },
  });

  console.log('\n📋 Tenants ทั้งหมดในระบบ:');
  console.table(tenants);

  // อัพเดต tenant "demo" (มหาเฮง Demo) → happy77
  const updated = await prisma.tenant.updateMany({
    where: {
      OR: [
        { slug: 'demo' },
        { name: { contains: 'มหาเฮง' } },
        { name: { contains: 'Demo' } },
      ],
    },
    data: {
      name: 'happy77',
      slug: 'happy77',
    },
  });

  console.log(`\n✅ อัพเดตสำเร็จ ${updated.count} รายการ`);

  // ยืนยันผล
  const after = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
  });
  console.log('\n📋 หลังอัพเดต:');
  console.table(after);

  // อัพเดต User ที่ email ใช้ @demo.crm → @happy77.crm (optional)
  const usersBefore = await prisma.user.findMany({
    where: { email: { contains: '@demo.crm' } },
    select: { id: true, email: true },
  });

  if (usersBefore.length > 0) {
    console.log('\n👥 Users ที่พบ (email @demo.crm):');
    console.table(usersBefore);
    console.log('💡 หากต้องการเปลี่ยน email ด้วย รัน: npx ts-node src/scripts/update-user-emails.ts');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
