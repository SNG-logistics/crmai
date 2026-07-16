# 🎰 Slot Bot Module — Setup Guide

## Overview

The Slot Bot module adds Telegram-based slot game catalog functionality to the CRM system.

### Features
- **Telegram Bot** with interactive inline keyboards
- **Slot Catalog** — manage providers (PG, JILI, Pragmatic, Joker, etc.) and games
- **Event Tracking** — record every button press (VIEW_PROVIDER, VIEW_GAME, CLICK_CONTACT_ADMIN, etc.)
- **Lead Management** — opt-in/opt-out with consent tracking
- **Auto-tagging** — leads auto-tagged by interest (interest_provider_pg, hot_lead, etc.)
- **Admin Dashboard** — stats, provider CRUD, game CRUD, lead viewer

---

## Installation

### 1. Run Database Migration
```bash
cd backend
npx prisma migrate dev --name add_slot_bot_module
```

### 2. Seed Slot Data
```bash
# Seeds PG, JILI, PRAGMATIC, JOKER + sample games
npm run seed:slots

# If you need a specific tenant:
SEED_TENANT_ID=<your-tenant-id> npm run seed:slots
```

### 3. Configure Telegram Channel

In the Admin Dashboard → **Settings → Channels → Telegram**:

Set the channel config JSON to include your admin username:
```json
{
  "botToken": "YOUR_BOT_TOKEN",
  "adminUsername": "your_admin_username"
}
```

### 4. Start the Backend
```bash
npm run dev
```

---

## Bot Commands (Telegram)

| Command | Description |
|---------|-------------|
| `/start` | Register as lead + show main menu |
| `/start pg_campaign_001` | Register with campaign tracking |
| `/stop` | Opt-out from messages |
| `/menu` | Show main menu again |
| `BONUSTIME` (free text, no `/start` needed) | Show provider grid directly |

## Bot Buttons (Telegram)

| Button | Action |
|--------|--------|
| 🎰 เลือกค่ายเกม | Show provider list |
| 🔥 เกมแนะนำ | Show recommended games |
| 🎁 โปรโมชั่น | Show promo message |
| 👩‍💻 ติดต่อแอดมิน | Show admin contact link |
| ❌ ยกเลิกรับข่าวสาร | Opt-out |

## LINE OA Integration

The same provider/game data (and the % sliders set in **Slot Games → ปุ่มแก้ไข**) now also drives replies inside the LINE CRM inbox (`backend/src/routes/webhooks/line.ts` + `backend/src/services/slot-line.service.ts`):

| Customer message | Bot reply |
|-------------------|-----------|
| `BONUSTIME` / `โบนัสไทม์` | Flex "BONUS TIME" grid of active providers (logo + name) |
| `เลือกค่าย <CODE หรือชื่อ>` (sent automatically when a provider tile is tapped) | Flex carousel of that provider's games, each card showing 🎯 อัตราชนะ, 🎁 เข้าฟรีสปิน, ⚡ WILD — pulled live from `popularityScore` / `bonusScore` / `featureScore` |
| `สนใจเกม <ชื่อเกม>` (sent when "ทักแอดมิน" is tapped on a game card) | Confirms the request and hands the conversation off to a human agent |

No new admin configuration is needed — providers/games/scores are managed exactly as before at `/slot/providers` and `/slot/games`; the LINE bot just renders whatever is active there. Provider logos and game images must be `https://` URLs (LINE Flex requirement) or they fall back to a 🎰 placeholder.

---

## API Endpoints

### Admin API (requires JWT token)

```
GET    /api/slot/providers          # List providers
POST   /api/slot/providers          # Create provider
PATCH  /api/slot/providers/:id      # Update provider
DELETE /api/slot/providers/:id      # Delete provider

GET    /api/slot/games              # List games (with filters)
POST   /api/slot/games              # Create game
PATCH  /api/slot/games/:id          # Update game
DELETE /api/slot/games/:id          # Delete game

POST   /api/slot/events             # Record event
GET    /api/slot/stats/overview     # Dashboard stats
GET    /api/slot/stats/games        # Game-level stats
GET    /api/slot/leads              # List leads (paginated)
```

### Internal Bot API (no auth, process-internal only)

```
GET    /internal/slot/providers                   # Active providers
GET    /internal/slot/providers/:code/games       # Games by provider
GET    /internal/slot/games/:id                   # Game detail
GET    /internal/slot/recommended                 # Recommended games
POST   /internal/slot/events                      # Record bot event
POST   /internal/slot/leads                       # Register/update lead
PATCH  /internal/slot/leads/consent               # Update consent status
POST   /internal/slot/leads/tag                   # Add interest tag
```

---

## Database Models

| Model | Purpose |
|-------|---------|
| `SlotProvider` | Game providers (PG, JILI, etc.) per tenant |
| `SlotGame` | Individual slot games with scores & tags |
| `SlotEvent` | Every user interaction (VIEW_PROVIDER, VIEW_GAME, etc.) |
| `SlotLead` | Users who opted-in via /start with consent status |

---

## Admin Dashboard Pages

| URL | Description |
|-----|-------------|
| `/slot` | Dashboard with stats overview |
| `/slot/providers` | Manage providers (CRUD) |
| `/slot/games` | Manage games with score sliders |
| `/slot/leads` | View all opt-in leads with tags |

---

## Lead Auto-Tagging

| Action | Tag Added |
|--------|-----------|
| Press PG SOFT button | `interest_provider_pg` |
| Press JILI button | `interest_provider_jili` |
| View game detail | `interest_game_<slug>` |
| Press contact admin | `hot_lead` |
| Press promo | (tracked as CLICK_PROMO event) |

---

## Compliance Notes

- ✅ Users MUST send `/start` to opt-in (no unsolicited messages)
- ✅ `/stop` command fully opts users out
- ✅ Bot blocked → `BLOCKED` status (no future sends)
- ✅ No guaranteed win language — uses "ความนิยม" and "รอบโบนัสที่ถูกรายงาน"
- ✅ No scraping from groups

---

## docker-compose

PostgreSQL and Redis are already configured in `docker-compose.yml`.

```bash
docker-compose up -d postgres redis
```
