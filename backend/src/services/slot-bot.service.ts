import axios from 'axios';

const TG_API = (token: string) => `https://api.telegram.org/bot${token}`;

// ─── Low-level Telegram API wrappers ──────────────────────────────────────────

export async function answerCallbackQuery(callbackQueryId: string, botToken: string, text?: string) {
  try {
    await axios.post(`${TG_API(botToken)}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text: text || '',
      show_alert: false,
    });
  } catch {}
}

export async function sendMessage(chatId: string, text: string, botToken: string, extra?: any) {
  return axios.post(`${TG_API(botToken)}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

export async function sendPhoto(chatId: string, photo: string, botToken: string, caption: string, replyMarkup?: any) {
  return axios.post(`${TG_API(botToken)}/sendPhoto`, {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

export async function editMessageText(chatId: string, messageId: number, text: string, botToken: string, extra?: any) {
  try {
    await axios.post(`${TG_API(botToken)}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...extra,
    });
  } catch {}
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎰 เลือกค่ายเกม', callback_data: 'MENU_PROVIDERS' },
        { text: '🔥 เกมแนะนำ', callback_data: 'MENU_RECOMMENDED' },
      ],
      [
        { text: '🎁 โปรโมชั่น', callback_data: 'MENU_PROMO' },
        { text: '👩‍💻 ติดต่อแอดมิน', callback_data: 'CONTACT_ADMIN' },
      ],
      [
        { text: '❌ ยกเลิกรับข่าวสาร', callback_data: 'UNSUBSCRIBE' },
      ],
    ],
  };
}

export function providerListKeyboard(providers: Array<{ code: string; name: string }>) {
  // Group into rows of 2
  const rows: any[][] = [];
  for (let i = 0; i < providers.length; i += 2) {
    const row = [
      { text: providers[i].name, callback_data: `PROVIDER_${providers[i].code}` },
    ];
    if (providers[i + 1]) {
      row.push({ text: providers[i + 1].name, callback_data: `PROVIDER_${providers[i + 1].code}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '⬅️ กลับหน้าหลัก', callback_data: 'BACK_MAIN' }]);
  return { inline_keyboard: rows };
}

export function gameCardKeyboard(gameId: string) {
  return {
    inline_keyboard: [
      [
        { text: '🔎 ดูรายละเอียด', callback_data: `GAME_${gameId}` },
        { text: '👩‍💻 ทักแอดมิน', callback_data: `CONTACT_GAME_${gameId}` },
      ],
    ],
  };
}

export function gameDetailKeyboard(gameId: string, providerCode: string) {
  return {
    inline_keyboard: [
      [{ text: '👩‍💻 ติดต่อแอดมิน', callback_data: `CONTACT_GAME_${gameId}` }],
      [{ text: '⬅️ กลับไปเลือกค่าย', callback_data: `PROVIDER_${providerCode}` }],
    ],
  };
}

export function contactAdminKeyboard(adminUsername: string) {
  return {
    inline_keyboard: [
      [{ text: '💬 เปิดแชตแอดมิน', url: `https://t.me/${adminUsername.replace('@', '')}` }],
      [{ text: '⬅️ กลับหน้าหลัก', callback_data: 'BACK_MAIN' }],
    ],
  };
}

export function backToMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '⬅️ กลับหน้าหลัก', callback_data: 'BACK_MAIN' }],
    ],
  };
}

// ─── Message Senders ──────────────────────────────────────────────────────────

export async function sendWelcome(chatId: string, botToken: string, displayName?: string) {
  const name = displayName ? ` คุณ${displayName}` : '';
  await sendMessage(chatId,
    `✅ ยินดีต้อนรับ${name} ครับ!\n\n` +
    `🎰 <b>BONUS TIME</b> — AI Winrate System\n` +
    `📊 อัปเดต Real-Time ทุกวัน\n\n` +
    `เลือกเมนูที่ต้องการได้เลยครับ\n` +
    `ระบบจะแนะนำค่ายเกมและเกมที่กำลังได้รับความนิยม\n\n` +
    `<i>หากไม่ต้องการรับข่าวสาร พิมพ์ /stop ได้ทุกเมื่อ</i>`,
    botToken,
    { reply_markup: mainMenuKeyboard() }
  );
}

export async function sendMainMenu(chatId: string, botToken: string) {
  await sendMessage(chatId,
    `🏠 <b>เมนูหลัก</b>\n\nเลือกสิ่งที่ต้องการด้านล่างครับ`,
    botToken,
    { reply_markup: mainMenuKeyboard() }
  );
}

export async function sendProviderList(chatId: string, botToken: string, providers: Array<{ code: string; name: string }>) {
  if (providers.length === 0) {
    await sendMessage(chatId, '🎰 ขณะนี้ยังไม่มีค่ายเกมที่เปิดให้บริการ กรุณาติดต่อแอดมินครับ', botToken);
    return;
  }
  await sendMessage(chatId,
    `🎰 <b>เลือกค่ายเกมที่สนใจ</b>\n\nมีทั้งหมด ${providers.length} ค่ายให้เลือกครับ`,
    botToken,
    { reply_markup: providerListKeyboard(providers) }
  );
}

export async function sendGameCard(chatId: string, botToken: string, game: {
  id: string; name: string; imageUrl?: string | null;
  providerName: string; popularityScore: number; bonusScore: number;
  tags: string[]; description?: string | null;
}) {
  const caption =
    `🎮 <b>${game.name}</b>\n` +
    `🏢 ค่าย: ${game.providerName}\n\n` +
    `📈 ความนิยม: ${game.popularityScore}%\n` +
    `🎁 รอบโบนัสที่ถูกรายงาน: ${game.bonusScore}%\n` +
    (game.tags.length > 0 ? `⚡ ฟีเจอร์เด่น: ${game.tags.join(', ')}\n` : '') +
    `\n<i>${game.description || 'เกมยอดนิยมที่มีผู้เล่นสนใจสูง'}</i>`;

  try {
    if (game.imageUrl && (game.imageUrl.startsWith('http') || game.imageUrl.startsWith('https'))) {
      await sendPhoto(chatId, game.imageUrl, botToken, caption, gameCardKeyboard(game.id));
    } else {
      await sendMessage(chatId, caption, botToken, { reply_markup: gameCardKeyboard(game.id) });
    }
  } catch {
    // Fallback to text if photo fails
    await sendMessage(chatId, caption, botToken, { reply_markup: gameCardKeyboard(game.id) });
  }
}

export async function sendGameDetail(chatId: string, botToken: string, game: {
  id: string; name: string; description?: string | null;
  popularityScore: number; bonusScore: number; featureScore: number;
  tags: string[]; playUrl?: string | null; providerCode: string;
}) {
  const text =
    `🎮 <b>${game.name}</b>\n\n` +
    `📋 รายละเอียด:\n${game.description || '-'}\n\n` +
    `📊 <b>สถิติ:</b>\n` +
    `• ความนิยม: <b>${game.popularityScore}%</b>\n` +
    `• รอบโบนัสที่ถูกรายงาน: <b>${game.bonusScore}%</b>\n` +
    `• คะแนนฟีเจอร์: <b>${game.featureScore}%</b>\n` +
    (game.tags.length > 0 ? `• ฟีเจอร์: ${game.tags.join(', ')}\n` : '') +
    `\n💡 ต้องการให้แอดมินแนะนำเพิ่มเติม กดปุ่มด้านล่างครับ`;

  await sendMessage(chatId, text, botToken, {
    reply_markup: gameDetailKeyboard(game.id, game.providerCode),
  });
}

export async function sendContactAdmin(chatId: string, botToken: string, adminUsername: string, gameName?: string) {
  const text = gameName
    ? `✅ รับเรื่องแล้วครับ!\n\nท่านสนใจเกม <b>${gameName}</b>\nแอดมินจะติดต่อกลับเพื่อแนะนำข้อมูลเพิ่มเติม\n\nหรือกดลิงก์ด้านล่างเพื่อคุยกับแอดมินทันทีครับ`
    : `✅ รับเรื่องแล้วครับ!\n\nแอดมินจะติดต่อกลับโดยเร็ว\nหรือกดลิงก์ด้านล่างเพื่อคุยทันทีครับ`;

  await sendMessage(chatId, text, botToken, {
    reply_markup: contactAdminKeyboard(adminUsername),
  });
}

export async function sendPromo(chatId: string, botToken: string) {
  await sendMessage(chatId,
    `🎁 <b>โปรโมชั่นพิเศษ</b>\n\n` +
    `📌 อัปเดตโปรโมชั่นล่าสุดผ่านแอดมินโดยตรงครับ\n\n` +
    `⚡ ติดต่อแอดมินเพื่อรับข้อมูลโปรที่เหมาะกับท่าน`,
    botToken,
    { reply_markup: backToMainKeyboard() }
  );
}

export async function sendOptOut(chatId: string, botToken: string) {
  await sendMessage(chatId,
    `✅ ยกเลิกการรับข่าวสารเรียบร้อยแล้วครับ\n\n` +
    `หากต้องการเริ่มต้นใหม่ พิมพ์ /start ได้ทุกเมื่อครับ`,
    botToken
  );
}
