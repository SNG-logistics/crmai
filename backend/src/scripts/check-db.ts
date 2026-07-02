import prisma from '../lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log('--- Tenants ---');
  console.log(tenants);

  for (const t of tenants) {
    const users = await prisma.user.findMany({ where: { tenantId: t.id } });
    console.log(`--- Users for tenant ${t.name} (${t.slug}) ---`);
    console.log(users.map(u => ({ email: u.email, username: u.username, role: u.role })));

    const channelConfigs = await prisma.channelConfig.findMany({ where: { tenantId: t.id } });
    console.log(`--- Channel Configs for tenant ${t.name} (${t.slug}) ---`);
    console.log(channelConfigs.map(c => ({ channel: c.channel, isActive: c.isActive, config: c.config })));

    const conversations = await prisma.conversation.findMany({ where: { tenantId: t.id }, include: { contact: true } });
    console.log(`--- Conversations for tenant ${t.name} (${t.slug}) ---`);
    console.log(conversations.map(c => ({ id: c.id, channel: c.channel, channelId: c.channelId, status: c.status, contactName: c.contact.displayName })));
  }
}

main().catch(console.error);
