import crypto from 'crypto';
import axios from 'axios';

export interface NormalizedMessage {
  platformUserId: string;
  displayName?: string;
  pictureUrl?: string;
  messageType: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'audio' | 'location';
  content: string;
  platformMsgId?: string;
  replyToken?: string;
  metadata?: any;
}

/**
 * Verify LINE webhook signature
 */
export function verifyLineSignature(body: Buffer | string, signature: string, channelSecret: string): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

/**
 * Parse LINE webhook event into normalized message
 */
export function parseLineEvent(event: any, profile?: any): NormalizedMessage | null {
  if (event.type !== 'message' && event.type !== 'follow') return null;

  const userId = event.source?.userId || event.source?.groupId || event.source?.roomId;
  if (!userId) return null;

  if (event.type === 'follow') {
    return {
      platformUserId: userId,
      displayName: profile?.displayName,
      pictureUrl: profile?.pictureUrl,
      messageType: 'text',
      content: '[เพิ่มเป็นเพื่อนแล้ว]',
      replyToken: event.replyToken,
      metadata: { eventType: 'follow' },
    };
  }

  const msg = event.message;
  let content = '';
  let messageType: NormalizedMessage['messageType'] = 'text';

  switch (msg.type) {
    case 'text': content = msg.text; break;
    case 'image': content = '[รูปภาพ]'; messageType = 'image'; break;
    case 'video': content = '[วิดีโอ]'; messageType = 'video'; break;
    case 'audio': content = '[เสียง]'; messageType = 'audio'; break;
    case 'file': content = `[ไฟล์: ${msg.fileName || 'file'}]`; messageType = 'file'; break;
    case 'sticker': content = '[สติ๊กเกอร์]'; messageType = 'sticker'; break;
    case 'location': content = `[ตำแหน่ง: ${msg.address || ''}]`; messageType = 'location'; break;
    default: content = '[ข้อความที่ไม่รองรับ]';
  }

  return {
    platformUserId: userId,
    displayName: profile?.displayName,
    pictureUrl: profile?.pictureUrl,
    messageType,
    content,
    platformMsgId: msg.id,
    replyToken: event.replyToken,
    metadata: { lineMessageType: msg.type },
  };
}

/**
 * Send reply message via LINE Reply API
 */
export async function sendLineReply(replyToken: string, messages: any[], accessToken: string): Promise<void> {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
}

/**
 * Send push message via LINE Push API
 */
export async function sendLinePush(userId: string, messages: any[], accessToken: string): Promise<void> {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to: userId, messages },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
}

/**
 * Get LINE user profile
 */
export async function getLineProfile(userId: string, accessToken: string): Promise<any> {
  const res = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

/**
 * Build LINE text message object
 */
export function lineTextMessage(text: string) {
  return { type: 'text', text };
}
