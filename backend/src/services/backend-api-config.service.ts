import crypto from 'crypto';
import prisma from '../lib/prisma';

export type BackendApiAuthType = 'none' | 'bearer' | 'api-key';

export type BackendApiConfig = {
  enabled: boolean;
  baseUrl: string;
  authType: BackendApiAuthType;
  authHeader: string;
  apiKeyEncrypted?: string;
  timeoutMs: number;
  healthEndpoint: string;
  endpoints: {
    customerLookup: string;
    registrationStatus: string;
    balance: string;
    depositStatus: string;
    withdrawalStatus: string;
  };
};

export const EMPTY_BACKEND_API_CONFIG: BackendApiConfig = {
  enabled: false,
  baseUrl: '',
  authType: 'bearer',
  authHeader: 'Authorization',
  timeoutMs: 10000,
  healthEndpoint: '/health',
  endpoints: {
    customerLookup: '',
    registrationStatus: '',
    balance: '',
    depositStatus: '',
    withdrawalStatus: '',
  },
};

function parseJson(value?: string | null): any {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function encryptionKey(): Buffer {
  const secret = process.env.API_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!secret) throw new Error('ยังไม่ได้ตั้ง API_CONFIG_ENCRYPTION_KEY หรือ JWT_SECRET บนเซิร์ฟเวอร์');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload?: string): string {
  if (!payload) return '';
  const [version, ivText, tagText, encryptedText] = payload.split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

export async function getBackendApiConfig(companyId: string, tenantId: string): Promise<BackendApiConfig | null> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: { settings: true },
  });
  if (!company) return null;
  const saved = parseJson(company.settings).backendApi || {};
  return {
    ...EMPTY_BACKEND_API_CONFIG,
    ...saved,
    endpoints: { ...EMPTY_BACKEND_API_CONFIG.endpoints, ...(saved.endpoints || {}) },
  };
}

export async function saveBackendApiConfig(
  companyId: string,
  tenantId: string,
  input: Omit<BackendApiConfig, 'apiKeyEncrypted'>,
  apiKey?: string,
  clearApiKey = false,
): Promise<BackendApiConfig | null> {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
  if (!company) return null;
  const settings = parseJson(company.settings);
  const previous: BackendApiConfig = {
    ...EMPTY_BACKEND_API_CONFIG,
    ...(settings.backendApi || {}),
    endpoints: { ...EMPTY_BACKEND_API_CONFIG.endpoints, ...(settings.backendApi?.endpoints || {}) },
  };
  const next: BackendApiConfig = {
    ...input,
    apiKeyEncrypted: clearApiKey
      ? undefined
      : apiKey ? encryptSecret(apiKey) : previous.apiKeyEncrypted,
  };
  settings.backendApi = next;
  await prisma.company.update({
    where: { id: company.id },
    data: { settings: JSON.stringify(settings) },
  });
  return next;
}

export function publicBackendApiConfig(config: BackendApiConfig) {
  const { apiKeyEncrypted, ...safe } = config;
  return { ...safe, hasApiKey: !!apiKeyEncrypted };
}
