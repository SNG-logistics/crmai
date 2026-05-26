# CRM มหาเฮง — AI-Powered Customer Relationship Management

ระบบ CRM Multi-Tenant ที่ใช้ AI ช่วยตอบแชทลูกค้า รองรับ LINE OA, Telegram และ Web Chat

## 🚀 Features

- **💬 Unified Inbox** — รวมแชทจากทุก platform ในที่เดียว
- **🤖 AI Bot** — ตอบแชทอัตโนมัติด้วย GPT-4o
- **📊 Analytics** — วิเคราะห์ข้อมูลการเงิน ยอดฝาก-ถอน
- **📣 Broadcast** — ส่งข้อความหาลูกค้าจำนวนมาก
- **💬 LINE FLEX** — สร้างข้อความสวยงามผ่าน LINE OA
- **📱 SMS Gateway** — ส่ง SMS ผ่าน ThSMS
- **🔴 Live Dashboard** — ดู KPI แบบ Real-time
- **⚡ Automation** — ตั้งกฎการทำงานอัตโนมัติ
- **📞 Telesales** — ระบบจัดการทีมโทรขาย

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Vanilla CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ORM | Prisma |
| Real-time | Socket.io |
| AI | CometAPI (OpenAI compatible) |
| Messaging | LINE Messaging API, Telegram Bot API |

## 📁 Project Structure

```
CRM/
├── frontend/          # Next.js 14 app
│   ├── app/
│   │   ├── (dashboard)/   # หน้าหลัก CRM
│   │   └── login/         # หน้า Login
│   ├── lib/               # API, Socket, Store
│   └── store/             # Zustand state
│
└── backend/           # Express API server
    ├── src/
    │   ├── routes/        # API routes
    │   ├── services/      # Business logic
    │   ├── middleware/     # Auth, Tenant
    │   └── lib/           # Prisma, Redis, Socket
    └── prisma/            # Schema & migrations
```

## 🏃 Quick Start

### Backend
```bash
cd backend
cp .env.example .env    # แก้ไข env vars
npm install
npx prisma migrate dev
npm run dev             # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # http://localhost:3000
```

## 🌐 Environment Variables

ดูตัวอย่างใน `backend/.env.example`

Key variables:
- `DATABASE_URL` — SQLite หรือ PostgreSQL connection
- `JWT_SECRET` — Secret สำหรับ JWT tokens
- `COMETAPI_KEY` — API Key สำหรับ AI (CometAPI)
- `LINE_CHANNEL_SECRET` + `LINE_CHANNEL_ACCESS_TOKEN`

## 📱 LINE OA Setup

1. สร้าง LINE OA ที่ [LINE Developers](https://developers.line.biz/)
2. ตั้ง Webhook URL: `https://your-domain.com/api/webhooks/line/{tenantId}`
3. ใส่ Channel Secret + Access Token ใน Settings → Channels

## 🚀 Production Deploy

ดู Phase 14 — PostgreSQL + Docker + Nginx
