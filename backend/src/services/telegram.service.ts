import axios from 'axios';
import { NormalizedMessage } from './line.service';

/**
 * Parse Telegram update into normalized message
 */
export function parseTelegramUpdate(update: any): NormalizedMessage | null {
  const message = update.message || update.edited_message || update.channel_post;
  if (!message) return null;

  const chatId = String(message.chat?.id);
  const from = message.from || message.chat;
  const displayName = from
    ? [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Unknown'
    : 'Unknown';

  let content = '';
  let messageType: NormalizedMessage['messageType'] = 'text';

  if (message.text) { content = message.text; }
  else if (message.photo) { content = message.caption || '[รูปภาพ]'; messageType = 'image'; }
  else if (message.video) { content = message.caption || '[วิดีโอ]'; messageType = 'video'; }
  else if (message.voice || message.audio) { content = '[เสียง]'; messageType = 'audio'; }
  else if (message.document) { content = `[ไฟล์: ${message.document.file_name || 'file'}]`; messageType = 'file'; }
  else if (message.sticker) { content = `[สติ๊กเกอร์: ${message.sticker.emoji || ''}]`; messageType = 'sticker'; }
  else if (message.location) { content = `[ตำแหน่ง: ${message.location.latitude},${message.location.longitude}]`; messageType = 'location'; }
  else return null;

  return {
    platformUserId: chatId,
    displayName,
    pictureUrl: undefined,
    messageType,
    content,
    platformMsgId: String(message.message_id),
    metadata: { chatType: message.chat?.type, username: from?.username },
  };
}

/**
 * Send message via Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  botToken: string,
  options: any = {}
): Promise<void> {
  await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

/**
 * Set Telegram webhook
 */
export async function setTelegramWebhook(botToken: string, webhookUrl: string): Promise<any> {
  const res = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    url: webhookUrl,
    drop_pending_updates: true,
  });
  return res.data;
}

/**
 * Delete Telegram webhook
 */
export async function deleteTelegramWebhook(botToken: string): Promise<any> {
  const res = await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
  return res.data;
}

/**
 * Get Telegram bot info
 */
export async function getTelegramBotInfo(botToken: string): Promise<any> {
  const res = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
  return res.data.result;
}
