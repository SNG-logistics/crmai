import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { rateLimit } from 'express-rate-limit';
import { initSocket } from './lib/socket';
import { connectRedis } from './lib/redis';
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import contactRoutes from './routes/contacts';
import ticketRoutes from './routes/tickets';
import botRoutes from './routes/bot';
import channelRoutes from './routes/channels';
import analyticsRoutes from './routes/analytics';
import broadcastRoutes from './routes/broadcasts';
import tenantAdminRoutes from './routes/tenants';
import usersRoutes from './routes/users';
import telesalesRoutes from './routes/telesales';
import automationRoutes from './routes/automation';
import syncRoutes from './routes/sync';
import smsRoutes  from './routes/sms';
import liveRoutes from './routes/live';
import flexRoutes from './routes/flex';
import lineWebhookRoutes from './routes/webhooks/line';




import telegramWebhookRoutes from './routes/webhooks/telegram';

const app = express();
const httpServer = createServer(app);

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// Parsing
app.use(morgan('dev'));
app.use('/api/webhooks', express.raw({ type: 'application/json' })); // raw for webhook signature verification
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Webhook routes (no auth)
app.use('/api/webhooks/line', lineWebhookRoutes);
app.use('/api/webhooks/telegram', telegramWebhookRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/admin', tenantAdminRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/telesales', telesalesRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/sync',      syncRoutes);
app.use('/api/sms',       smsRoutes);
app.use('/api/live',      liveRoutes);
app.use('/api/flex',      flexRoutes);





// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Global error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// 404
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  try {
    // Redis is optional — don't await, just try
    connectRedis().catch(() => {});
    initSocket(httpServer);
    httpServer.listen(PORT, () => {
      console.log(`🚀 CRM Backend running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io ready`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down...'); httpServer.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('SIGINT received, shutting down...'); httpServer.close(() => process.exit(0)); });

main();
