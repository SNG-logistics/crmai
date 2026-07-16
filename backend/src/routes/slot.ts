import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import * as slotService from '../services/slot.service';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: Response, data: any, status = 200) {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, message: string, status = 400) {
  res.status(status).json({ success: false, message });
}

// ─── Provider routes (/api/slot/providers) ────────────────────────────────────

router.get('/providers', verifyToken, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenantId;
  const all = req.query.all === 'true';
  const data = all
    ? await slotService.getAllProviders(tenantId)
    : await slotService.getProviders(tenantId);
  ok(res, data);
});

router.post('/providers', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { code, name, logoUrl, sortOrder } = req.body;
    if (!code || !name) return fail(res, 'code and name are required');
    const provider = await slotService.createProvider(tenantId, { code, name, logoUrl, sortOrder });
    ok(res, provider, 201);
  } catch (e: any) {
    fail(res, e.message || 'Failed to create provider');
  }
});

router.patch('/providers/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { name, logoUrl, sortOrder, isActive } = req.body;
    const provider = await slotService.updateProvider(tenantId, req.params.id, { name, logoUrl, sortOrder, isActive });
    ok(res, provider);
  } catch (e: any) {
    fail(res, e.message || 'Failed to update provider');
  }
});

router.delete('/providers/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    await slotService.deleteProvider(tenantId, req.params.id);
    ok(res, { deleted: true });
  } catch (e: any) {
    fail(res, e.message || 'Failed to delete provider', 404);
  }
});

// ─── Game routes (/api/slot/games) ────────────────────────────────────────────

router.get('/games', verifyToken, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenantId;
  const filters: any = {};
  if (req.query.providerId) filters.providerId = req.query.providerId;
  if (req.query.isRecommended !== undefined) filters.isRecommended = req.query.isRecommended === 'true';
  if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === 'true';
  const data = await slotService.getAllGames(tenantId, filters);
  ok(res, data);
});

router.post('/games', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { providerId, code, name, description, imageUrl, playUrl, tags, isRecommended, popularityScore, bonusScore, featureScore } = req.body;
    if (!providerId || !name || !code) return fail(res, 'providerId, code, and name are required');
    const game = await slotService.createGame(tenantId, {
      providerId, code, name, description, imageUrl, playUrl,
      tags: Array.isArray(tags) ? tags : [],
      isRecommended, popularityScore, bonusScore, featureScore,
    });
    ok(res, game, 201);
  } catch (e: any) {
    fail(res, e.message || 'Failed to create game');
  }
});

router.patch('/games/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const game = await slotService.updateGame(tenantId, req.params.id, req.body);
    ok(res, game);
  } catch (e: any) {
    fail(res, e.message || 'Failed to update game');
  }
});

router.delete('/games/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    await slotService.deleteGame(tenantId, req.params.id);
    ok(res, { deleted: true });
  } catch (e: any) {
    fail(res, e.message || 'Failed to delete game', 404);
  }
});

// ─── Events (/api/slot/events) ────────────────────────────────────────────────

router.post('/events', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { telegramUserId, contactId, gameId, providerId, campaignSource, eventType, metadata } = req.body;
    const event = await slotService.recordEvent(tenantId, { telegramUserId, contactId, gameId, providerId, campaignSource, eventType, metadata });
    ok(res, event, 201);
  } catch (e: any) {
    fail(res, e.message || 'Failed to record event');
  }
});

// ─── Stats (/api/slot/stats) ──────────────────────────────────────────────────

router.get('/stats/overview', verifyToken, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenantId;
  const data = await slotService.getStatsOverview(tenantId);
  ok(res, data);
});

router.get('/stats/games', verifyToken, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenantId;
  const data = await slotService.getGameStats(tenantId);
  ok(res, data);
});

// ─── Leads (/api/slot/leads) ──────────────────────────────────────────────────

router.get('/leads', verifyToken, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenantId;
  const { consentStatus, tag, page, limit } = req.query as any;
  const data = await slotService.getLeads(tenantId, {
    consentStatus,
    tag,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  ok(res, data);
});

export default router;
