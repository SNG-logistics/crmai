import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';

import authRouter from './routes/auth';
import linksRouter from './routes/links';
import clicksRouter from './routes/clicks';
import analysisRouter from './routes/analysis';
import usersRouter from './routes/users';
import redirectRouter from './routes/redirect';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/links', linksRouter);
app.use('/api/clicks', clicksRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/users', usersRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'lufy.cc', time: new Date().toISOString() }));

// ─── Redirect handler (/:slug) — must be LAST ─────────────────────────────────
app.use('/', redirectRouter);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 lufy.cc backend running on http://localhost:${PORT}`);
});

export default app;
