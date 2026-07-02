import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'images');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)'));
  },
});

/** POST /api/upload/image — upload a single image, return URL */
router.post('/image', upload.single('image'), (req: Request, res: Response): void => {
  if (!req.file) { res.status(400).json({ success: false, message: 'ไม่พบไฟล์รูปภาพ' }); return; }

  // Build public URL
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${protocol}://${host}/uploads/images/${req.file.filename}`;

  res.json({
    success: true,
    url,
    filename: req.file.filename,
    size: req.file.size,
  });
});

/** GET /api/upload/images — list uploaded images */
router.get('/images', (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json({ success: true, images: files });
  } catch { res.json({ success: true, images: [] }); }
});

export default router;
