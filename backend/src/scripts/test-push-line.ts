import prisma from '../lib/prisma';
import { sendLinePush } from '../services/line.service';

function parseCfg(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

async function main() {
  const ch = await prisma.channelConfig.findUnique({
    where: { tenantId_channel: { tenantId: 'cmpl7zoco00039nmlofqakkwz', channel: 'line' } },
  });
  if (!ch) {
    console.error('Channel not found');
    return;
  }
  const cfg = parseCfg(ch.config);
  
  const flexMsg = {
    type: 'flex',
    altText: 'ยินดีต้อนรับสู่มหาเฮง!',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'Hello!' }
        ]
      }
    }
  };

  try {
    console.log('Sending message to dummy user ID...');
    await sendLinePush('U1234567890abcdef', [flexMsg], cfg.accessToken);
    console.log('Success!');
  } catch (e: any) {
    console.error('Error sending message:');
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', e.response.data);
    } else {
      console.error(e.message);
    }
  }
}

main().catch(console.error);
