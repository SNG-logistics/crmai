import { Router, Request, Response } from 'express';
import axios from 'axios';
import { verifyToken, requireRole } from '../middleware/auth';
import { canAccessCompany, getUserCompanyIds } from '../lib/company-scope';
import {
  BackendApiAuthType,
  decryptSecret,
  getBackendApiConfig,
  publicBackendApiConfig,
  saveBackendApiConfig,
} from '../services/backend-api-config.service';

const router = Router();
router.use(verifyToken);

async function ensureCompanyAccess(req: Request, companyId: string): Promise<boolean> {
  const allowed = await getUserCompanyIds(req.user!.id);
  return canAccessCompany(allowed, companyId);
}

function cleanPath(value: unknown, max = 500): string {
  const path = typeof value === 'string' ? value.trim().slice(0, max) : '';
  if (/^https?:\/\//i.test(path)) throw new Error('Endpoint ต้องเป็น path ภายใต้ Base URL เท่านั้น');
  return path;
}

function normalizeInput(body: any) {
  const baseUrl = (body.baseUrl || '').toString().trim().replace(/\/+$/, '');
  if (baseUrl) {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Base URL ต้องเป็น http/https และห้ามฝัง username/password ใน URL');
    }
  }
  const authType: BackendApiAuthType = ['none', 'bearer', 'api-key'].includes(body.authType)
    ? body.authType
    : 'bearer';
  const authHeader = (body.authHeader || (authType === 'api-key' ? 'x-api-key' : 'Authorization')).toString().trim();
  if (!/^[A-Za-z0-9-]{1,50}$/.test(authHeader)) throw new Error('ชื่อ Header ไม่ถูกต้อง');
  const timeoutMs = Math.min(30000, Math.max(1000, Number(body.timeoutMs) || 10000));
  return {
    enabled: body.enabled === true,
    baseUrl,
    authType,
    authHeader,
    timeoutMs,
    healthEndpoint: cleanPath(body.healthEndpoint || '/health'),
    endpoints: {
      customerLookup: cleanPath(body.endpoints?.customerLookup),
      registrationStatus: cleanPath(body.endpoints?.registrationStatus),
      balance: cleanPath(body.endpoints?.balance),
      depositStatus: cleanPath(body.endpoints?.depositStatus),
      withdrawalStatus: cleanPath(body.endpoints?.withdrawalStatus),
    },
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = (req.query.companyId || '').toString();
    if (!companyId || !(await ensureCompanyAccess(req, companyId))) {
      return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้' });
    }
    const config = await getBackendApiConfig(companyId, req.tenantId!);
    if (!config) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });
    return res.json({ success: true, config: publicBackendApiConfig(config) });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const companyId = (req.body.companyId || '').toString();
    if (!companyId || !(await ensureCompanyAccess(req, companyId))) {
      return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้' });
    }
    const input = normalizeInput(req.body);
    const apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const saved = await saveBackendApiConfig(
      companyId,
      req.tenantId!,
      input,
      apiKey || undefined,
      req.body.clearApiKey === true,
    );
    if (!saved) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });
    return res.json({ success: true, config: publicBackendApiConfig(saved) });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/test', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const companyId = (req.body.companyId || '').toString();
    if (!companyId || !(await ensureCompanyAccess(req, companyId))) {
      return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้' });
    }
    const config = await getBackendApiConfig(companyId, req.tenantId!);
    if (!config) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });
    if (!config.baseUrl) return res.status(400).json({ success: false, message: 'กรุณาตั้ง Base URL ก่อนทดสอบ' });

    const endpoint = cleanPath(config.healthEndpoint || '/health');
    const target = new URL(endpoint.replace(/^\/+/, ''), `${config.baseUrl.replace(/\/+$/, '')}/`).toString();
    const headers: Record<string, string> = {};
    const secret = decryptSecret(config.apiKeyEncrypted);
    if (secret && config.authType === 'bearer') headers[config.authHeader || 'Authorization'] = `Bearer ${secret}`;
    if (secret && config.authType === 'api-key') headers[config.authHeader || 'x-api-key'] = secret;

    const started = Date.now();
    const response = await axios.get(target, {
      headers,
      timeout: config.timeoutMs,
      validateStatus: () => true,
      maxRedirects: 2,
    });
    const latencyMs = Date.now() - started;
    return res.json({
      success: response.status >= 200 && response.status < 400,
      status: response.status,
      latencyMs,
      message: response.status >= 200 && response.status < 400
        ? 'เชื่อมต่อ API สำเร็จ'
        : `API ตอบกลับ HTTP ${response.status}`,
    });
  } catch (e: any) {
    const status = e.response?.status;
    return res.status(400).json({
      success: false,
      status,
      message: status ? `เชื่อมต่อได้แต่ API ตอบ HTTP ${status}` : (e.code === 'ECONNABORTED' ? 'หมดเวลารอ API' : e.message),
    });
  }
});

export default router;
