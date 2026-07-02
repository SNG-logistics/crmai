import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'lufy-secret';

// Simple HMAC-signed session cookie (no external dep needed)
export function signSession(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

export function verifySession(token: string): any | null {
  try {
    const [data, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(data, 'base64').toString());
  } catch { return null; }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const session = verifySession(token);
  if (!session?.userId) return res.status(401).json({ success: false, message: 'Invalid session' });
  (req as any).userId = session.userId;
  (req as any).username = session.username;
  (req as any).isAdmin = session.isAdmin || false;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!(req as any).isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });
    next();
  });
}
