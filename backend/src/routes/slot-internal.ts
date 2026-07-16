/**
 * Internal Slot Bot API — called from the Telegram webhook handler
 * No JWT auth required, but only accessible within the same process.
 * In production, these endpoints should NOT be exposed externally.
 */
import { Router, Request, Response } from 'express';
import * as slotService from '../services/slot.service';
import prisma from '../lib/prisma';

const router = Router();

function ok(res: Response, data: any) {
  res.json({ success: true, data });
}

function fail(res: Response, message: string, status = 400) {
  res.status(status).json({ success: false, message });
}

// GET /internal/slot/tenant
router.get('/tenant', async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true }
    });
    if (!tenant) return fail(res, 'No active tenant found', 404);
    ok(res, { id: tenant.id, name: tenant.name, slug: tenant.slug });
  } catch (e: any) {
    fail(res, e.message);
  }
});

// GET /internal/slot/providers?tenantId=xxx
router.get('/providers', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) return fail(res, 'tenantId required');
  const data = await slotService.getProviders(tenantId);
  ok(res, data);
});

// GET /internal/slot/providers/:code/games?tenantId=xxx
router.get('/providers/:code/games', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) return fail(res, 'tenantId required');
  const data = await slotService.getGamesByProvider(tenantId, req.params.code);
  ok(res, data);
});

// GET /internal/slot/games/:id?tenantId=xxx
router.get('/games/:id', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) return fail(res, 'tenantId required');
  const data = await slotService.getGameById(tenantId, req.params.id);
  if (!data) return fail(res, 'Game not found', 404);
  ok(res, data);
});

// GET /internal/slot/recommended?tenantId=xxx
router.get('/recommended', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) return fail(res, 'tenantId required');
  const data = await slotService.getRecommendedGames(tenantId);
  ok(res, data);
});

// POST /internal/slot/events
router.post('/events', async (req: Request, res: Response) => {
  const { tenantId, ...data } = req.body;
  if (!tenantId) return fail(res, 'tenantId required');
  try {
    const event = await slotService.recordEvent(tenantId, data);
    ok(res, event);
  } catch (e: any) {
    fail(res, e.message);
  }
});

// POST /internal/slot/leads
router.post('/leads', async (req: Request, res: Response) => {
  const { tenantId, telegramId, displayName, username, campaignSource } = req.body;
  if (!tenantId || !telegramId) return fail(res, 'tenantId and telegramId required');
  try {
    const lead = await slotService.registerLead(tenantId, { telegramId, displayName, username, campaignSource });
    ok(res, lead);
  } catch (e: any) {
    fail(res, e.message);
  }
});

// PATCH /internal/slot/leads/consent
router.patch('/leads/consent', async (req: Request, res: Response) => {
  const { tenantId, telegramId, status } = req.body;
  if (!tenantId || !telegramId || !status) return fail(res, 'tenantId, telegramId, and status required');
  try {
    await slotService.updateConsent(tenantId, telegramId, status);
    ok(res, { updated: true });
  } catch (e: any) {
    fail(res, e.message);
  }
});

// POST /internal/slot/leads/tag
router.post('/leads/tag', async (req: Request, res: Response) => {
  const { tenantId, telegramId, tag } = req.body;
  if (!tenantId || !telegramId || !tag) return fail(res, 'tenantId, telegramId, and tag required');
  try {
    await slotService.addLeadTag(tenantId, telegramId, tag);
    ok(res, { tagged: true });
  } catch (e: any) {
    fail(res, e.message);
  }
});

export default router;
