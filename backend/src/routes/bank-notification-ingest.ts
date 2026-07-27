import { Router, Request, Response } from 'express';
import { authenticateAndIngestBankNotification } from '../services/bank-notification.service';

const router = Router();

// This endpoint intentionally does not use user JWT auth. Enrolled phones use a
// separate per-device HMAC credential and the signature is calculated over the
// exact raw request bytes.
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ success: false, message: 'Expected application/json body' });
    }
    const result = await authenticateAndIngestBankNotification(req.body, {
      publicId: String(req.header('x-bank-device-id') || ''),
      timestamp: String(req.header('x-bank-timestamp') || ''),
      nonce: String(req.header('x-bank-nonce') || ''),
      signature: String(req.header('x-bank-signature') || ''),
    });
    return res.status(result.statusCode).json(result.body);
  } catch (error: any) {
    console.error('[BankNotification] Ingest error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Bank notification ingest failed' });
  }
});

export default router;
