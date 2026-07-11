import prisma from './prisma';

/**
 * หา ChannelConfig ที่เหมาะสม:
 * 1) config ของบริษัทที่ระบุ (companyId)
 * 2) config กลางของ tenant (companyId = null)
 * 3) config ใดๆ ของ channel นั้น (backward compat)
 */
export async function getChannelConfig(tenantId: string, channel: string, companyId?: string | null) {
  if (companyId) {
    const c = await prisma.channelConfig.findFirst({ where: { tenantId, channel, companyId } });
    if (c) return c;
  }
  const def = await prisma.channelConfig.findFirst({ where: { tenantId, channel, companyId: null } });
  if (def) return def;
  return prisma.channelConfig.findFirst({ where: { tenantId, channel } });
}

/** parse config JSON อย่างปลอดภัย */
export function parseChannelConfig(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}
