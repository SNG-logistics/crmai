import prisma from '../lib/prisma';
import { decryptSecret, encryptSecret } from './backend-api-config.service';
import { CrmProfile, REGISTER_FIELDS, missingRegisterFields } from './contact-memory.service';

export type CustomerGameCredentials = {
  username: string;
  password: string;
  updatedAt?: string;
};

type StoredCustomerGameCredentials = {
  username: string;
  passwordEncrypted: string;
  updatedAt: string;
  sourceConversationId: string;
  source: 'agent_message';
};

const USER_LABEL =
  String.raw`(?:username|user\s*(?:name|id)?|login|ยูส(?:เซอร์(?:เนม)?|เชอร์|เชี้|เกม)?|ชื่อผู้ใช้|ไอดี(?:เกม)?|ຢູສເຊີ(?:ເນມ)?|ຊື່ຜູ້ໃຊ້|ຢູສ)`;
const PASSWORD_LABEL =
  String.raw`(?:password|pass(?:word)?|pwd|pin|(?:รหัส|ระหัส|รหัด|ละหัด|ลหัส)(?:ผ่าน|เข้า(?:เล่น|เกม)|เกม)?|พาส(?:เวิร์ด)?|ລະຫັດ(?:ຜ່ານ|ເຂົ້າຫຼິ້ນ)?)`;

function parseJson(value?: string | null): any {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function normalizeCredentialValue(value: string, kind: 'username' | 'password'): string | undefined {
  const candidate = (value || '')
    .replace(/^[\s:：=\-–—]+/, '')
    .replace(/^(?:คือ|ແມ່ນ)\s*/i, '')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/^[`"'“”'()[\]{}]+|[`"'“”'()[\]{},;|]+$/g, '')
    .trim();
  if (!candidate || candidate.length < 2 || candidate.length > 128) return undefined;
  if (/^(?:and|or|กับ|และ|คือ|ແລະ|null|none|ไม่มี|ບໍ່ມີ|-|n\/a)$/i.test(candidate)) return undefined;
  if (/^https?:\/\//i.test(candidate) || /@(?:lid|s\.whatsapp\.net)$/i.test(candidate)) return undefined;
  if (kind === 'username' && new RegExp(`^(?:${USER_LABEL}|${PASSWORD_LABEL})$`, 'iu').test(candidate)) return undefined;
  if (kind === 'password' && new RegExp(`^(?:${PASSWORD_LABEL}|${USER_LABEL})$`, 'iu').test(candidate)) return undefined;
  return candidate;
}

/**
 * Extract only an explicitly labelled username/password pair.
 * Requiring both values keeps ordinary chat such as "please send the user"
 * from being mistaken for credentials.
 */
export function extractGameCredentials(text: string): CustomerGameCredentials | null {
  if (!text || text.length > 4_000) return null;
  const labels = new RegExp(
    `(?<![\\p{L}\\p{N}_@.-])(?:(?<username>${USER_LABEL})|(?<password>${PASSWORD_LABEL}))(?![\\p{L}\\p{N}_@.-])`,
    'giu',
  );
  const matches = [...text.matchAll(labels)];
  if (matches.length < 2) return null;

  let username: string | undefined;
  let password: string | undefined;
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const kind: 'username' | 'password' = match.groups?.username ? 'username' : 'password';
    const valueStart = (match.index || 0) + match[0].length;
    const nextLabelStart = matches[index + 1]?.index ?? text.length;
    const lineEndOffset = text.slice(valueStart, nextLabelStart).search(/\r?\n/);
    const valueEnd = lineEndOffset >= 0 ? valueStart + lineEndOffset : nextLabelStart;
    const value = normalizeCredentialValue(text.slice(valueStart, valueEnd), kind);
    if (!value) continue;
    if (kind === 'username') username = value;
    else password = value;
  }

  return username && password ? { username, password } : null;
}

export function isCredentialRecoveryIntent(text: string): boolean {
  const normalized = (text || '').trim();
  if (!normalized) return false;
  const credentialNoun = new RegExp(
    `(?:${USER_LABEL}|${PASSWORD_LABEL}|ข้อมูลเข้าเล่น|ข้อมูลล็อกอิน|login\\s*(?:details|info)|ຂໍ້ມູນເຂົ້າຫຼິ້ນ)`,
    'iu',
  );
  if (!credentialNoun.test(normalized)) return false;
  const forgotOrRequest =
    /ลืม|จำไม่ได้|ขอ|ส่ง|บอก|แจ้ง|เอายูส|forgot|forget|send|give|what(?:'s| is)|need|ລືມ|ຈື່ບໍ່ໄດ້|ຂໍ|ສົ່ງ|ແຈ້ງ|ບອກ/iu;
  if (forgotOrRequest.test(normalized)) return true;
  return new RegExp(`^(?:${USER_LABEL}|${PASSWORD_LABEL})[\\s?!.,]*$`, 'iu').test(normalized);
}

export function readCustomerGameCredentials(
  contact: { customFields?: string | null },
  companyId: string,
): CustomerGameCredentials | null {
  const customFields = parseJson(contact.customFields);
  const stored = customFields.customer_game_credentials?.[companyId] as StoredCustomerGameCredentials | undefined;
  if (!stored || typeof stored.username !== 'string' || typeof stored.passwordEncrypted !== 'string') return null;
  const username = normalizeCredentialValue(stored.username, 'username');
  const password = decryptSecret(stored.passwordEncrypted);
  if (!username || !password) return null;
  return { username, password, updatedAt: stored.updatedAt };
}

/**
 * Save credentials only against the contact/company resolved from this exact
 * WhatsApp conversation. Callers never choose a different contact target.
 */
export async function captureCredentialsFromWhatsAppAgentMessage(opts: {
  tenantId: string;
  conversationId: string;
  text: string;
}): Promise<CustomerGameCredentials | null> {
  const credentials = extractGameCredentials(opts.text);
  if (!credentials) return null;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: opts.conversationId,
      tenantId: opts.tenantId,
      channel: 'whatsapp',
    },
    select: {
      id: true,
      companyId: true,
      contact: { select: { id: true, customFields: true } },
    },
  });
  if (!conversation?.companyId || !conversation.contact) return null;

  const customFields = parseJson(conversation.contact.customFields);
  const credentialsByCompany =
    customFields.customer_game_credentials && typeof customFields.customer_game_credentials === 'object'
      ? { ...customFields.customer_game_credentials }
      : {};
  const now = new Date().toISOString();
  const stored: StoredCustomerGameCredentials = {
    username: credentials.username,
    passwordEncrypted: encryptSecret(credentials.password),
    updatedAt: now,
    sourceConversationId: conversation.id,
    source: 'agent_message',
  };
  credentialsByCompany[conversation.companyId] = stored;
  customFields.customer_game_credentials = credentialsByCompany;

  await prisma.contact.update({
    where: { id: conversation.contact.id },
    data: {
      customFields: JSON.stringify(customFields),
    },
  });
  console.log(
    `[CustomerCredentials] saved contact=${conversation.contact.id}`
    + ` company=${conversation.companyId} conversation=${conversation.id}`,
  );
  return { ...credentials, updatedAt: now };
}

export async function backfillCredentialsFromWhatsAppHistory(opts: {
  tenantId: string;
  conversationId: string;
}): Promise<CustomerGameCredentials | null> {
  const messages = await prisma.message.findMany({
    where: {
      tenantId: opts.tenantId,
      conversationId: opts.conversationId,
      senderType: 'agent',
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { content: true },
  });
  const source = messages.find(message => extractGameCredentials(message.content));
  if (!source) return null;
  return captureCredentialsFromWhatsAppAgentMessage({
    ...opts,
    text: source.content,
  });
}

export function buildCredentialReply(credentials: CustomerGameCredentials): string {
  return `ຂໍ້ມູນເຂົ້າຫຼິ້ນຂອງລູກຄ້າເຈົ້າ\nຢູສເຊີ: ${credentials.username}\nລະຫັດຜ່ານ: ${credentials.password}`;
}

export function buildUnregisteredCredentialReply(profile: CrmProfile): string {
  const intro =
    'ຕອນນີ້ຍັງບໍ່ພົບຢູສເຊີທີ່ລົງທະບຽນຂອງລູກຄ້າເຈົ້າ '
    + 'ຖ້າສົນໃຈສະໝັກ ລົບກວນແຈ້ງຂໍ້ມູນໃຫ້ແອດມິນຕາມນີ້ເຈົ້າ';
  const labels: Record<string, string> = {
    fullName: 'ຊື່ - ນາມສະກຸນ',
    phone: 'ເບີໂທທີ່ໃຊ້ສະໝັກ',
    bankName: 'ທະນາຄານ',
    bankAccount: 'ເລກບັນຊີທະນາຄານ',
  };
  const missing = missingRegisterFields(profile);
  const fields = missing.length > 0 ? missing : REGISTER_FIELDS;
  const form = fields
    .map(field => `✅${labels[field.key]}: ${missing.length === 0 ? profile[field.key] || '' : ''}`)
    .join('\n');
  const suffix = missing.length === 0
    ? '\n\nຂໍ້ມູນສະໝັກມີຄົບແລ້ວ ລົບກວນຢືນຢັນໃຫ້ແອດມິນກວດສອບ ແລະສ້າງຢູສເຊີໃຫ້ເຈົ້າ'
    : '\n\nກະລຸນາພິມຂໍ້ມູນເປັນຕົວໜັງສືໃຫ້ແອດມິນເຈົ້າ';
  return `${intro}\n${form}${suffix}`;
}
