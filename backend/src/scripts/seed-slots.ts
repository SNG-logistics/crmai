/**
 * Seed script: Slot Bot providers and sample games
 * Usage: npx ts-node-dev --transpile-only src/scripts/seed-slots.ts
 *
 * Requires: SEED_TENANT_ID env var or will use the first tenant found
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';

async function main() {
  // Find target tenant
  const tenantId = process.env.SEED_TENANT_ID;
  let tenant;

  if (tenantId) {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  } else {
    tenant = await prisma.tenant.findFirst();
  }

  if (!tenant) {
    console.error('❌ No tenant found. Create a tenant first via the admin panel.');
    process.exit(1);
  }

  console.log(`🌱 Seeding Slot Bot data for tenant: ${tenant.name} (${tenant.id})`);

  // ─── Providers ──────────────────────────────────────────────────────────────

  const providers = [
    { code: 'PG', name: 'PG SOFT', sortOrder: 1 },
    { code: 'JILI', name: 'JILI', sortOrder: 2 },
    { code: 'PRAGMATIC', name: 'PRAGMATIC PLAY', sortOrder: 3 },
    { code: 'JOKER', name: 'JOKER GAMING', sortOrder: 4 },
    { code: 'SPADE', name: 'SPADE GAMING', sortOrder: 5 },
    { code: 'RICH88', name: 'RICH88', sortOrder: 6 },
  ];

  const createdProviders: Record<string, any> = {};

  for (const p of providers) {
    const provider = await prisma.slotProvider.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      create: { ...p, tenantId: tenant.id, isActive: true },
      update: { name: p.name, sortOrder: p.sortOrder },
    });
    createdProviders[p.code] = provider;
    console.log(`  ✅ Provider: ${provider.name} (${provider.id})`);
  }

  // ─── PG SOFT Games ──────────────────────────────────────────────────────────

  const pgGames = [
    {
      code: 'speed_winner', name: 'Speed Winner', slug: 'speed-winner',
      description: 'เกมสล็อตความเร็วสูงที่มีผู้เล่นสนใจมากที่สุดในสัปดาห์นี้',
      tags: JSON.stringify(['Free Spin', 'Wild', 'Multiplier']),
      popularityScore: 92, bonusScore: 88, featureScore: 90,
      isRecommended: true,
    },
    {
      code: 'pinata_wins', name: 'Pinata Wins', slug: 'pinata-wins',
      description: 'เกมเม็กซิกันสีสันสดใส มีรอบโบนัสที่น่าตื่นเต้น',
      tags: JSON.stringify(['Bonus Round', 'Cascading', 'Free Spin']),
      popularityScore: 85, bonusScore: 91, featureScore: 87,
      isRecommended: true,
    },
    {
      code: 'fortune_tiger', name: 'Fortune Tiger', slug: 'fortune-tiger',
      description: 'เสือแห่งโชคลาภ เกมยอดนิยมที่ผู้เล่นชื่นชอบ',
      tags: JSON.stringify(['Wild', 'Scatter', 'Lucky Spin']),
      popularityScore: 95, bonusScore: 89, featureScore: 93,
      isRecommended: true,
    },
    {
      code: 'mahjong_ways', name: 'Mahjong Ways', slug: 'mahjong-ways',
      description: 'มาห์จองสไตล์เอเชียที่ได้รับความนิยมสูงมาก',
      tags: JSON.stringify(['Megaways', 'Bonus Buy', 'Tumble']),
      popularityScore: 88, bonusScore: 85, featureScore: 92,
      isRecommended: false,
    },
    {
      code: 'gem_saviour', name: 'Gem Saviour Conquest', slug: 'gem-saviour',
      description: 'การผจญภัยในดันเจี้ยนพร้อมอัญมณีล้ำค่า',
      tags: JSON.stringify(['Adventure', 'Wild', 'Free Spin']),
      popularityScore: 80, bonusScore: 82, featureScore: 85,
      isRecommended: false,
    },
  ];

  for (const g of pgGames) {
    await prisma.slotGame.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: g.slug } },
      create: { tenantId: tenant.id, providerId: createdProviders['PG'].id, isActive: true, ...g },
      update: { popularityScore: g.popularityScore, bonusScore: g.bonusScore, featureScore: g.featureScore, isRecommended: g.isRecommended },
    });
    console.log(`  ✅ PG Game: ${g.name}`);
  }

  // ─── JILI Games ─────────────────────────────────────────────────────────────

  const jiliGames = [
    {
      code: 'boxing_king', name: 'Boxing King', slug: 'boxing-king',
      description: 'เกมมวยชั้นนำที่มีผู้เล่นมากที่สุดจาก JILI',
      tags: JSON.stringify(['Wild', 'Free Spin', 'Scatter']),
      popularityScore: 90, bonusScore: 87, featureScore: 88,
      isRecommended: true,
    },
    {
      code: 'golden_empire', name: 'Golden Empire', slug: 'golden-empire',
      description: 'อาณาจักรทองคำที่รอการค้นพบ',
      tags: JSON.stringify(['Expanding Wild', 'Bonus Round', 'Progressive']),
      popularityScore: 86, bonusScore: 90, featureScore: 89,
      isRecommended: true,
    },
    {
      code: 'super_ace', name: 'Super Ace', slug: 'super-ace',
      description: 'สุดยอดเกมไพ่ที่ได้รับความนิยมสูงสุดจาก JILI',
      tags: JSON.stringify(['Card Game', 'Wild', 'Jackpot']),
      popularityScore: 94, bonusScore: 92, featureScore: 91,
      isRecommended: true,
    },
  ];

  for (const g of jiliGames) {
    await prisma.slotGame.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: g.slug } },
      create: { tenantId: tenant.id, providerId: createdProviders['JILI'].id, isActive: true, ...g },
      update: { popularityScore: g.popularityScore, bonusScore: g.bonusScore, isRecommended: g.isRecommended },
    });
    console.log(`  ✅ JILI Game: ${g.name}`);
  }

  // ─── PRAGMATIC Games ─────────────────────────────────────────────────────────

  const pragmaticGames = [
    {
      code: 'gates_of_olympus', name: 'Gates of Olympus', slug: 'gates-of-olympus',
      description: 'ประตูแห่งโอลิมปัส เกมระดับโลกจาก Pragmatic Play',
      tags: JSON.stringify(['Tumble', 'Multiplier', 'Bonus Buy', 'Free Spin']),
      popularityScore: 97, bonusScore: 95, featureScore: 96,
      isRecommended: true,
    },
    {
      code: 'sweet_bonanza', name: 'Sweet Bonanza', slug: 'sweet-bonanza',
      description: 'โลกแห่งขนมหวาน ที่มีรอบโบนัสสุดหวาน',
      tags: JSON.stringify(['Tumble', 'Scatter', 'Multiplier', 'Free Spin']),
      popularityScore: 93, bonusScore: 94, featureScore: 92,
      isRecommended: true,
    },
    {
      code: 'starlight_princess', name: 'Starlight Princess', slug: 'starlight-princess',
      description: 'เจ้าหญิงแห่งดวงดาว เกมยอดนิยมที่มี Multiplier สูง',
      tags: JSON.stringify(['Wild', 'Multiplier', 'Free Spin', 'Bonus Buy']),
      popularityScore: 91, bonusScore: 93, featureScore: 94,
      isRecommended: true,
    },
  ];

  for (const g of pragmaticGames) {
    await prisma.slotGame.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: g.slug } },
      create: { tenantId: tenant.id, providerId: createdProviders['PRAGMATIC'].id, isActive: true, ...g },
      update: { popularityScore: g.popularityScore, bonusScore: g.bonusScore, isRecommended: g.isRecommended },
    });
    console.log(`  ✅ PRAGMATIC Game: ${g.name}`);
  }

  // ─── JOKER Games ─────────────────────────────────────────────────────────────

  const jokerGames = [
    {
      code: 'roma', name: 'ROMA', slug: 'roma-joker',
      description: 'โรม่า เกมสุดคลาสสิกที่ทุกคนรู้จัก',
      tags: JSON.stringify(['Classic', 'Free Spin', 'Wild']),
      popularityScore: 88, bonusScore: 86, featureScore: 85,
      isRecommended: true,
    },
    {
      code: 'lucky_god', name: 'Lucky God', slug: 'lucky-god-joker',
      description: 'เทพแห่งโชคลาภ เกมสไตล์เอเชียจาก JOKER',
      tags: JSON.stringify(['Asian Theme', 'Bonus', 'Scatter']),
      popularityScore: 82, bonusScore: 84, featureScore: 80,
      isRecommended: false,
    },
  ];

  for (const g of jokerGames) {
    await prisma.slotGame.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: g.slug } },
      create: { tenantId: tenant.id, providerId: createdProviders['JOKER'].id, isActive: true, ...g },
      update: { popularityScore: g.popularityScore, bonusScore: g.bonusScore, isRecommended: g.isRecommended },
    });
    console.log(`  ✅ JOKER Game: ${g.name}`);
  }

  console.log('\n✅ Slot Bot seed completed!');
  console.log(`   Providers: ${Object.keys(createdProviders).length}`);

  const gameCount = await prisma.slotGame.count({ where: { tenantId: tenant.id } });
  console.log(`   Games: ${gameCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
