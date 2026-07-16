import prisma from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlotEventType =
  | 'VIEW_PROVIDER'
  | 'VIEW_GAME'
  | 'CLICK_CONTACT_ADMIN'
  | 'CLICK_PROMO'
  | 'OPEN_MINIAPP'
  | 'UNSUBSCRIBE';

export type ConsentStatus = 'OPTED_IN' | 'OPTED_OUT' | 'BLOCKED';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export async function getProviders(tenantId: string) {
  const providers = await prisma.slotProvider.findMany({
    where: { tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { games: { where: { isActive: true } } } } },
  });
  return providers.map(p => ({ ...p, gameCount: p._count.games }));
}

export async function getAllProviders(tenantId: string) {
  return prisma.slotProvider.findMany({
    where: { tenantId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { games: true } } },
  });
}

export async function createProvider(tenantId: string, data: {
  code: string; name: string; logoUrl?: string; sortOrder?: number;
}) {
  return prisma.slotProvider.create({
    data: { tenantId, ...data, code: data.code.toUpperCase() },
  });
}

export async function updateProvider(tenantId: string, id: string, data: {
  name?: string; logoUrl?: string; sortOrder?: number; isActive?: boolean;
}) {
  return prisma.slotProvider.update({
    where: { id },
    data,
  });
}

export async function deleteProvider(tenantId: string, id: string) {
  // Ensure the provider belongs to this tenant
  const p = await prisma.slotProvider.findFirst({ where: { id, tenantId } });
  if (!p) throw new Error('Provider not found');
  return prisma.slotProvider.delete({ where: { id } });
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function getGamesByProvider(tenantId: string, providerCode: string) {
  const provider = await prisma.slotProvider.findUnique({
    where: { tenantId_code: { tenantId, code: providerCode.toUpperCase() } },
  });
  if (!provider) return [];

  const games = await prisma.slotGame.findMany({
    where: { tenantId, providerId: provider.id, isActive: true },
    orderBy: [{ isRecommended: 'desc' }, { popularityScore: 'desc' }],
    include: { provider: { select: { name: true, code: true } } },
  });

  return games.map(g => ({
    ...g,
    tags: parseJson<string[]>(g.tags, []),
    providerName: g.provider.name,
    providerCode: g.provider.code,
  }));
}

export async function getAllGames(tenantId: string, filters?: {
  providerId?: string; isRecommended?: boolean; isActive?: boolean;
}) {
  const games = await prisma.slotGame.findMany({
    where: { tenantId, ...filters },
    orderBy: { updatedAt: 'desc' },
    include: { provider: { select: { name: true, code: true } } },
  });
  return games.map(g => ({
    ...g,
    tags: parseJson<string[]>(g.tags, []),
    providerName: g.provider.name,
  }));
}

export async function getGameById(tenantId: string, gameId: string) {
  const game = await prisma.slotGame.findFirst({
    where: { id: gameId, tenantId },
    include: { provider: { select: { name: true, code: true } } },
  });
  if (!game) return null;
  return {
    ...game,
    tags: parseJson<string[]>(game.tags, []),
    providerName: game.provider.name,
    providerCode: game.provider.code,
  };
}

export async function getRecommendedGames(tenantId: string, limit = 5) {
  const games = await prisma.slotGame.findMany({
    where: { tenantId, isRecommended: true, isActive: true },
    orderBy: { popularityScore: 'desc' },
    take: limit,
    include: { provider: { select: { name: true, code: true } } },
  });
  return games.map(g => ({
    ...g,
    tags: parseJson<string[]>(g.tags, []),
    providerName: g.provider.name,
    providerCode: g.provider.code,
  }));
}

export async function createGame(tenantId: string, data: {
  providerId: string; code: string; name: string; description?: string;
  imageUrl?: string; playUrl?: string; tags?: string[];
  isRecommended?: boolean; popularityScore?: number; bonusScore?: number; featureScore?: number;
}) {
  const { tags = [], ...rest } = data;
  const slug = slugify(data.name) + '-' + Date.now().toString(36);
  return prisma.slotGame.create({
    data: {
      tenantId,
      ...rest,
      slug,
      tags: JSON.stringify(tags),
    },
  });
}

export async function updateGame(tenantId: string, id: string, data: {
  name?: string; description?: string; imageUrl?: string; playUrl?: string;
  tags?: string[]; isRecommended?: boolean; isActive?: boolean;
  popularityScore?: number; bonusScore?: number; featureScore?: number;
}) {
  const game = await prisma.slotGame.findFirst({ where: { id, tenantId } });
  if (!game) throw new Error('Game not found');
  const { tags, ...rest } = data;
  return prisma.slotGame.update({
    where: { id },
    data: {
      ...rest,
      ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
    },
  });
}

export async function deleteGame(tenantId: string, id: string) {
  const game = await prisma.slotGame.findFirst({ where: { id, tenantId } });
  if (!game) throw new Error('Game not found');
  return prisma.slotGame.delete({ where: { id } });
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function recordEvent(tenantId: string, data: {
  telegramUserId?: string;
  contactId?: string;
  gameId?: string;
  providerId?: string;
  campaignSource?: string;
  eventType: SlotEventType;
  metadata?: Record<string, any>;
}) {
  const { metadata, ...rest } = data;
  return prisma.slotEvent.create({
    data: {
      tenantId,
      ...rest,
      metadata: metadata ? JSON.stringify(metadata) : '{}',
    },
  });
}

// ─── Lead Management ──────────────────────────────────────────────────────────

export async function registerLead(tenantId: string, data: {
  telegramId: string;
  displayName?: string;
  username?: string;
  campaignSource?: string;
}) {
  const existing = await prisma.slotLead.findUnique({
    where: { tenantId_telegramId: { tenantId, telegramId: data.telegramId } },
  });

  if (existing) {
    // Re-activate if previously opted out
    const updateData: any = {
      lastActiveAt: new Date(),
      displayName: data.displayName,
      username: data.username,
    };
    if (existing.consentStatus === 'OPTED_OUT') {
      updateData.consentStatus = 'OPTED_IN';
    }
    return prisma.slotLead.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  return prisma.slotLead.create({
    data: {
      tenantId,
      telegramId: data.telegramId,
      displayName: data.displayName,
      username: data.username,
      campaignSource: data.campaignSource,
      consentStatus: 'OPTED_IN',
    },
  });
}

export async function updateConsent(tenantId: string, telegramId: string, status: ConsentStatus) {
  return prisma.slotLead.updateMany({
    where: { tenantId, telegramId },
    data: { consentStatus: status },
  });
}

export async function addLeadTag(tenantId: string, telegramId: string, tag: string) {
  const lead = await prisma.slotLead.findUnique({
    where: { tenantId_telegramId: { tenantId, telegramId } },
  });
  if (!lead) return;

  const tags: string[] = parseJson<string[]>(lead.tags, []);
  if (!tags.includes(tag)) {
    tags.push(tag);
    await prisma.slotLead.update({
      where: { id: lead.id },
      data: { tags: JSON.stringify(tags), lastActiveAt: new Date() },
    });
  }
}

export async function getLeads(tenantId: string, filters?: {
  consentStatus?: string; tag?: string; page?: number; limit?: number;
}) {
  const { page = 1, limit = 20, consentStatus, tag } = filters || {};
  const where: any = { tenantId };
  if (consentStatus) where.consentStatus = consentStatus;

  const leads = await prisma.slotLead.findMany({
    where,
    orderBy: { lastActiveAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.slotLead.count({ where });

  const parsed = leads.map(l => ({
    ...l,
    tags: parseJson<string[]>(l.tags, []),
  }));

  // Filter by tag in JS (SQLite can't do JSON array queries efficiently)
  const filtered = tag
    ? parsed.filter(l => l.tags.includes(tag))
    : parsed;

  return { leads: filtered, total, page, limit };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStatsOverview(tenantId: string) {
  const [
    totalLeads,
    optedIn,
    hotLeads,
    totalEvents,
    todayEvents,
    topGames,
    topProviders,
  ] = await Promise.all([
    prisma.slotLead.count({ where: { tenantId } }),
    prisma.slotLead.count({ where: { tenantId, consentStatus: 'OPTED_IN' } }),
    // leads tagged as hot_lead
    prisma.slotLead.count({ where: { tenantId, tags: { contains: 'hot_lead' } } }),
    prisma.slotEvent.count({ where: { tenantId } }),
    prisma.slotEvent.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    // Top 5 games by VIEW_GAME events
    prisma.slotEvent.groupBy({
      by: ['gameId'],
      where: { tenantId, eventType: 'VIEW_GAME', gameId: { not: null } },
      _count: { gameId: true },
      orderBy: { _count: { gameId: 'desc' } },
      take: 5,
    }),
    // Top providers by VIEW_PROVIDER events
    prisma.slotEvent.groupBy({
      by: ['providerId'],
      where: { tenantId, eventType: 'VIEW_PROVIDER', providerId: { not: null } },
      _count: { providerId: true },
      orderBy: { _count: { providerId: 'desc' } },
      take: 5,
    }),
  ]);

  // Hydrate game names
  const gameIds = topGames.map(g => g.gameId!);
  const games = await prisma.slotGame.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, name: true, popularityScore: true },
  });
  const gameMap = Object.fromEntries(games.map(g => [g.id, g]));

  // Hydrate provider names
  const providerIds = topProviders.map(p => p.providerId!);
  const providers = await prisma.slotProvider.findMany({
    where: { id: { in: providerIds } },
    select: { id: true, name: true, code: true },
  });
  const providerMap = Object.fromEntries(providers.map(p => [p.id, p]));

  return {
    totalLeads,
    optedIn,
    hotLeads,
    totalEvents,
    todayEvents,
    topGames: topGames.map(g => ({
      gameId: g.gameId,
      count: g._count.gameId,
      game: gameMap[g.gameId!] || null,
    })),
    topProviders: topProviders.map(p => ({
      providerId: p.providerId,
      count: p._count.providerId,
      provider: providerMap[p.providerId!] || null,
    })),
  };
}

export async function getGameStats(tenantId: string) {
  const events = await prisma.slotEvent.groupBy({
    by: ['gameId', 'eventType'],
    where: { tenantId, gameId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const gameIds = [...new Set(events.map(e => e.gameId!))];
  const games = await prisma.slotGame.findMany({
    where: { id: { in: gameIds } },
    include: { provider: { select: { name: true } } },
  });
  const gameMap = Object.fromEntries(games.map(g => [g.id, g]));

  const result: Record<string, any> = {};
  for (const e of events) {
    if (!result[e.gameId!]) {
      result[e.gameId!] = { game: gameMap[e.gameId!], events: {} };
    }
    result[e.gameId!].events[e.eventType] = e._count.id;
  }

  return Object.values(result);
}
