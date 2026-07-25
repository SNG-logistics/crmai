import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { analyzeKnowledgeImage, generateAIResponse, parseBotSettings, processBotMessage } from '../services/ai.service';
import { KNOWLEDGE_FILE_EXTENSIONS, parseKnowledgeFile } from '../services/knowledge-file.service';
const router = Router();
router.use(verifyToken);

const VISUAL_KNOWLEDGE_DIR = path.resolve(process.cwd(), 'uploads', 'knowledge');
const visualKnowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('รองรับเฉพาะรูป JPG, PNG และ WEBP'));
  },
});
const documentKnowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLocaleLowerCase();
    if (KNOWLEDGE_FILE_EXTENSIONS.has(extension)) cb(null, true);
    else cb(new Error(`ไม่รองรับไฟล์ ${extension || file.mimetype}`));
  },
});

function acceptVisualKnowledgeUpload(req: Request, res: Response, next: NextFunction): void {
  visualKnowledgeUpload.single('image')(req, res, (error: any) => {
    if (!error) return next();
    const message = error?.code === 'LIMIT_FILE_SIZE'
      ? 'รูปต้องมีขนาดไม่เกิน 10 MB'
      : (error?.message || 'อัปโหลดรูปไม่สำเร็จ');
    res.status(400).json({ success: false, message });
  });
}

function acceptDocumentKnowledgeUpload(req: Request, res: Response, next: NextFunction): void {
  documentKnowledgeUpload.array('files', 20)(req, res, (error: any) => {
    if (!error) return next();
    const message = error?.code === 'LIMIT_FILE_SIZE'
      ? 'แต่ละไฟล์ต้องมีขนาดไม่เกิน 25 MB'
      : error?.code === 'LIMIT_FILE_COUNT'
        ? 'อัปโหลดได้ครั้งละไม่เกิน 20 ไฟล์'
        : (error?.message || 'อัปโหลดไฟล์ความรู้ไม่สำเร็จ');
    res.status(400).json({ success: false, message });
  });
}

function cleanText(value: unknown, maxLength: number): string {
  return (typeof value === 'string' ? value : '').trim().slice(0, maxLength);
}

// เลือกบริษัทที่จะจัดการ config: ?companyId= หรือ body.companyId ; ไม่ระบุ → บริษัทเริ่มต้นของ tenant
// (สร้างบริษัทเริ่มต้นให้อัตโนมัติถ้ายังไม่มี — กัน tenant เก่าที่ยังไม่ backfill)
async function resolveCompanyId(req: Request): Promise<string> {
  const tenantId = req.tenantId!;
  const q = (req.query.companyId || req.body?.companyId) as string | undefined;
  if (q) {
    const c = await prisma.company.findFirst({ where: { id: q, tenantId }, select: { id: true } });
    if (c) return c.id;
  }
  let def = await prisma.company.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!def) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
    def = await prisma.company.create({
      data: { tenantId, name: t?.name || 'บริษัทหลัก', slug: t?.slug || undefined },
      select: { id: true },
    });
  }
  return def.id;
}

async function ensureBotConfig(tenantId: string, companyId: string) {
  const existing = await prisma.botConfig.findFirst({ where: { companyId } });
  if (existing) return existing;
  try {
    return await prisma.botConfig.create({
      data: {
        tenantId,
        companyId,
        name: 'AI LINE BOT',
        systemPrompt: '',
        model: 'gemini-3.6-flash',
        temperature: 0.7,
        isActive: true,
        metadata: '{}',
      },
    });
  } catch {
    // ป้องกันคำขอพร้อมกันสร้าง config ซ้ำจาก unique(companyId)
    const createdByOtherRequest = await prisma.botConfig.findFirst({ where: { companyId } });
    if (createdByOtherRequest) return createdByOtherRequest;
    throw new Error('สร้างการตั้งค่า AI ไม่สำเร็จ');
  }
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({
      where: { companyId },
      include: { knowledgeBase: { where: { isActive: true }, orderBy: { createdAt: 'desc' } } },
    });
    return res.json({ success: true, bot, companyId });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const { systemPrompt, model, temperature, isActive, settings } = req.body;
    const companyId = await resolveCompanyId(req);
    const existing = await prisma.botConfig.findFirst({ where: { companyId } });
    // merge metadata เดิมเสมอ เพื่อไม่ให้หน้า WhatsApp/AI เขียนค่าของอีกหน้าหาย
    let currentMetadata: any = {};
    try { currentMetadata = JSON.parse(existing?.metadata || '{}'); } catch { currentMetadata = {}; }
    const metadata = settings !== undefined
      ? JSON.stringify({ ...currentMetadata, ...(settings || {}) })
      : undefined;
    const bot = existing
      ? await prisma.botConfig.update({ where: { id: existing.id }, data: { systemPrompt, model, temperature, isActive, ...(metadata !== undefined ? { metadata } : {}) } })
      : await prisma.botConfig.create({ data: { tenantId: req.tenantId!, companyId, name: 'AI Bot', systemPrompt, model, temperature, isActive, metadata: metadata || '{}' } });
    return res.json({ success: true, bot });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// GET /api/bot/knowledge — list all knowledge base items
router.get('/knowledge', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    if (!bot) return res.json({ success: true, items: [], total: 0, hasMore: false });
    const sourceType = req.query.sourceType === 'visual' ? 'visual'
      : req.query.sourceType === 'qa' ? 'qa'
        : req.query.sourceType === 'document' ? 'document' : undefined;
    const where = { botConfigId: bot.id, ...(sourceType ? { sourceType } : {}) };
    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(wantsPagination ? { skip: (page - 1) * limit, take: limit } : {}),
      }),
      prisma.knowledgeBase.count({ where }),
    ]);
    return res.json({
      success: true,
      items,
      total,
      page: wantsPagination ? page : 1,
      hasMore: wantsPagination ? page * limit < total : false,
    });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/knowledge', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await ensureBotConfig(req.tenantId!, companyId);
    const question = cleanText(req.body?.question, 1000);
    const answer = cleanText(req.body?.answer, 20000);
    const category = cleanText(req.body?.category, 100) || 'general';
    if (!question || !answer) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกคำถามและคำตอบ' });
    }
    const item = await prisma.knowledgeBase.create({
      data: { botConfigId: bot.id, question, answer, category, sourceType: 'qa', isActive: true },
    });
    return res.status(201).json({ success: true, item });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/bot/knowledge/visual — เพิ่มความรู้จากรูป + ข้อความ (เพิ่มได้ไม่จำกัดจำนวน)
// Extract searchable knowledge from documents and Q&A tables.
router.post('/knowledge/upload', acceptDocumentKnowledgeUpload, async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ความรู้อย่างน้อย 1 ไฟล์' });
    }

    const companyId = await resolveCompanyId(req);
    const bot = await ensureBotConfig(req.tenantId!, companyId);
    const category = cleanText(req.body?.category, 100) || 'เอกสาร';
    const parsedFiles: Array<Awaited<ReturnType<typeof parseKnowledgeFile>>> = [];
    const failures: Array<{ fileName: string; message: string }> = [];

    for (const file of files) {
      try {
        parsedFiles.push(await parseKnowledgeFile(file, category));
      } catch (error: any) {
        failures.push({
          fileName: path.basename(file.originalname || 'document'),
          message: error?.message || 'อ่านไฟล์ไม่สำเร็จ',
        });
      }
    }

    const maxItemsPerUpload = 300;
    const parsedCount = parsedFiles.reduce((sum, file) => sum + file.entries.length, 0);
    const pendingItems = parsedFiles
      .flatMap(parsed => parsed.entries.map(entry => ({
        botConfigId: bot.id,
        question: cleanText(entry.question, 1_000),
        answer: cleanText(entry.answer, 20_000),
        category: cleanText(entry.category || category, 100) || category,
        sourceType: 'document',
        sourceText: `นำเข้าจากไฟล์ ${parsed.fileName}`,
        sendImage: false,
        isActive: true,
      })))
      .filter(item => item.question && item.answer)
      .slice(0, maxItemsPerUpload);

    if (!pendingItems.length) {
      return res.status(422).json({
        success: false,
        message: failures[0]?.message || 'ไม่พบข้อความที่นำมาใช้เป็นความรู้ได้',
        failures,
      });
    }

    const created = await prisma.knowledgeBase.createMany({ data: pendingItems });
    return res.status(201).json({
      success: true,
      imported: created.count,
      files: parsedFiles.map(file => ({
        fileName: file.fileName,
        entries: file.entries.length,
        truncated: file.truncated,
      })),
      failures,
      truncated: parsedCount > maxItemsPerUpload,
    });
  } catch (error: any) {
    console.error('[Document Knowledge] import failed:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'อ่านและบันทึกไฟล์ความรู้ไม่สำเร็จ',
    });
  }
});

router.post('/knowledge/visual', acceptVisualKnowledgeUpload, async (req: Request, res: Response) => {
  const savedImagePaths: string[] = [];
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await ensureBotConfig(req.tenantId!, companyId);
    const sourceText = cleanText(req.body?.sourceText, 12000);
    const category = cleanText(req.body?.category, 100) || 'visual';
    const sendImage = req.body?.sendImage !== 'false';
    if (!req.file && !sourceText) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบรูปหรือใส่ข้อความความรู้' });
    }

    const analysis = req.file
      ? await analyzeKnowledgeImage({
          imageBase64: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
          sourceText,
          model: bot.model,
        })
      : {
          title: sourceText.split(/\r?\n/)[0].slice(0, 300) || 'ความรู้จากผู้ดูแล',
          extractedText: '',
          summary: sourceText,
          searchTerms: [] as string[],
        };

    let imageUrl: string | null = null;
    let imagePreviewUrl: string | null = null;
    if (req.file) {
      const tenantDirectory = path.join(VISUAL_KNOWLEDGE_DIR, req.tenantId!);
      await fs.promises.mkdir(tenantDirectory, { recursive: true });
      const fileId = `${Date.now()}-${randomUUID()}`;
      const filename = `${fileId}.jpg`;
      const previewFilename = `${fileId}-preview.jpg`;
      const imagePath = path.join(tenantDirectory, filename);
      const previewPath = path.join(tenantDirectory, previewFilename);

      // LINE รับเฉพาะ JPEG/PNG ผ่าน HTTPS และ preview ต้องมีขนาดเล็ก
      // จึง normalize รูปทุกชนิด (รวม WEBP) เป็น JPEG สองขนาดตั้งแต่ตอนบันทึก
      let normalizedImage = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, progressive: true })
        .toBuffer();
      if (normalizedImage.length > 9 * 1024 * 1024) {
        normalizedImage = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 78, progressive: true })
          .toBuffer();
      }
      let previewImage = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 70, progressive: true })
        .toBuffer();
      if (previewImage.length > 900 * 1024) {
        previewImage = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 58, progressive: true })
          .toBuffer();
      }

      await fs.promises.writeFile(imagePath, normalizedImage);
      savedImagePaths.push(imagePath);
      await fs.promises.writeFile(previewPath, previewImage);
      savedImagePaths.push(previewPath);
      imageUrl = `/uploads/knowledge/${req.tenantId!}/${filename}`;
      imagePreviewUrl = `/uploads/knowledge/${req.tenantId!}/${previewFilename}`;
    }

    const analysisParts = [
      analysis.extractedText ? `ข้อความที่อ่านได้จากรูป:\n${analysis.extractedText}` : '',
      analysis.summary ? `สรุปข้อเท็จจริง:\n${analysis.summary}` : '',
      analysis.searchTerms.length ? `คำค้น:\n${analysis.searchTerms.join(', ')}` : '',
    ].filter(Boolean);
    const imageAnalysis = analysisParts.join('\n\n');
    const answer = [
      sourceText ? `ข้อความที่ผู้ดูแลกำหนด:\n${sourceText}` : '',
      imageAnalysis,
    ].filter(Boolean).join('\n\n').slice(0, 30000);

    const item = await prisma.knowledgeBase.create({
      data: {
        botConfigId: bot.id,
        question: analysis.title,
        answer,
        category,
        sourceType: 'visual',
        sourceText: sourceText || null,
        imageUrl,
        imagePreviewUrl,
        imageAnalysis: imageAnalysis || null,
        sendImage,
        isActive: true,
      },
    });
    return res.status(201).json({ success: true, item });
  } catch (error: any) {
    for (const savedImagePath of savedImagePaths) {
      await fs.promises.unlink(savedImagePath).catch(() => undefined);
    }
    console.error('[Visual Knowledge] create failed:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'วิเคราะห์และบันทึกความรู้จากรูปไม่สำเร็จ',
    });
  }
});

router.put('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId }, select: { id: true } });
    if (!bot) return res.status(404).json({ success: false, message: 'ไม่พบการตั้งค่า AI ของบริษัทนี้' });
    const existing = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.id, botConfigId: bot.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบรายการความรู้ของบริษัทนี้' });
    const data: { question?: string; answer?: string; category?: string; isActive?: boolean; sendImage?: boolean } = {};
    if (req.body?.question !== undefined) data.question = cleanText(req.body.question, 1000);
    if (req.body?.answer !== undefined) data.answer = cleanText(req.body.answer, 30000);
    if (req.body?.category !== undefined) data.category = cleanText(req.body.category, 100) || 'general';
    if (typeof req.body?.isActive === 'boolean') data.isActive = req.body.isActive;
    if (typeof req.body?.sendImage === 'boolean') data.sendImage = req.body.sendImage;
    const item = await prisma.knowledgeBase.update({ where: { id: existing.id }, data });
    return res.json({ success: true, item });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId }, select: { id: true } });
    if (!bot) return res.status(404).json({ success: false, message: 'ไม่พบการตั้งค่า AI ของบริษัทนี้' });
    const item = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.id, botConfigId: bot.id },
      select: { id: true, imageUrl: true, imagePreviewUrl: true },
    });
    if (!item) return res.status(404).json({ success: false, message: 'ไม่พบรายการความรู้ของบริษัทนี้' });
    await prisma.knowledgeBase.delete({ where: { id: item.id } });
    for (const storedUrl of [item.imageUrl, item.imagePreviewUrl]) {
      if (storedUrl?.startsWith('/uploads/knowledge/')) {
        const filePath = path.resolve(process.cwd(), storedUrl.replace(/^\/+/, ''));
        if (filePath.startsWith(VISUAL_KNOWLEDGE_DIR + path.sep)) {
          await fs.promises.unlink(filePath).catch(() => undefined);
        }
      }
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/test', async (req: Request, res: Response) => {
  try {
    const { message, history = [], channel } = req.body;
    const companyId = await resolveCompanyId(req);
    const result = await processBotMessage(
      req.tenantId!,
      history,
      (message || '').toString(),
      undefined,
      companyId,
      { channel: ['line', 'whatsapp', 'telegram'].includes(channel) ? channel : undefined },
    );
    return res.json({
      success: true,
      reply: result.reply,
      imageUrl: result.imageUrl,
      imagePreviewUrl: result.imagePreviewUrl,
      knowledgeId: result.knowledgeId,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/bot/auto-seed — AI สร้าง Q&A อัตโนมัติ ────────────────────────
router.post('/auto-seed', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    if (!bot) return res.status(404).json({ success: false, message: 'กรุณาตั้งค่า Bot ก่อน' });

    const { category = 'general', count = 10 } = req.body;
    const settings = parseBotSettings(bot.metadata);
    const source = [bot.systemPrompt, settings.businessInfo].filter(Boolean).join('\n\n').trim();
    if (!source) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาใส่ System Prompt หรือข้อมูลธุรกิจก่อนสร้าง FAQ เพื่อป้องกัน AI แต่งความรู้เอง',
      });
    }

    const messages = [
      {
        role: 'system' as const,
        content: `คุณเป็นผู้เชี่ยวชาญสร้าง FAQ สำหรับ Customer Service Bot ในธุรกิจไทย
กฎ: สร้าง ${Math.min(count, 15)} คู่ คำถาม-คำตอบ ที่ลูกค้ามักจะถามบ่อย
ตอบเป็น JSON array: [{"question":"...", "answer":"..."}]
คำตอบต้อง: สุภาพ กระชับ 1-3 ประโยค ภาษาไทย
ห้ามใส่ markdown หรือ code blocks ตอบ JSON อย่างเดียว`
      },
      {
        role: 'user' as const,
        content: `ข้อมูลต้นทางที่ผู้ดูแลอนุญาต:
"""${source}"""
หมวด: ${category}
สร้าง FAQ ${Math.min(count, 15)} ข้อโดยใช้เฉพาะข้อมูลต้นทางนี้:`
      }
    ];

    const raw = await generateAIResponse(messages, bot.model || 'gpt-4o', 0.8, 1500);

    let items: { question: string; answer: string }[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      items = JSON.parse(cleaned);
    } catch {
      return res.status(400).json({ success: false, message: 'AI ไม่สามารถสร้าง Q&A ได้ กรุณาลองใหม่', raw });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่ได้รับ Q&A จาก AI' });
    }

    const created: any[] = [];
    for (const item of items) {
      if (!item.question || !item.answer) continue;
      const kb = await prisma.knowledgeBase.create({
        data: { botConfigId: bot.id, question: item.question.trim(), answer: item.answer.trim(), category, isActive: true },
      });
      created.push(kb as any);
    }

    return res.json({ success: true, message: `✅ สร้าง Q&A สำเร็จ ${created.length} ข้อ`, items: created, count: created.length });
  } catch (err: any) {
    console.error('Auto-seed error:', err);
    return res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
});

// ─── PUT /api/bot/extended — welcome message, quick replies, handoff keywords ──
router.put('/extended', async (req: Request, res: Response) => {
  try {
    const { welcomeMessage, quickReplies, handoffKeywords, whatsappLanguage } = req.body;
    const companyId = await resolveCompanyId(req);
    const existing = await prisma.botConfig.findFirst({ where: { companyId } });
    let current: any = {};
    try { current = JSON.parse(existing?.metadata || '{}'); } catch { current = {}; }
    const metadata = JSON.stringify({
      ...current,
      welcomeMessage,
      quickReplies,
      handoffKeywords,
      whatsappLanguage: whatsappLanguage === 'lo' ? 'lo' : 'th',
    });
    const bot = existing
      ? await prisma.botConfig.update({ where: { id: existing.id }, data: { metadata } })
      : await prisma.botConfig.create({
          data: { tenantId: req.tenantId!, companyId, name: 'AI Bot', systemPrompt: '', model: 'gemini-3.6-flash', temperature: 0.7, isActive: true, metadata },
        });
    return res.json({ success: true, bot });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/bot/extended — ดึง extended config ──────────────────────────────
router.get('/extended', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    let extended: any = {};
    if (bot && (bot as any).metadata) {
      try { extended = JSON.parse((bot as any).metadata); } catch { extended = {}; }
    }
    return res.json({ success: true, extended });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;
