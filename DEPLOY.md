# 🚀 Deploy CRM ขึ้นโดเมนจริง — Windows VPS + GoDaddy

คู่มือนี้พาต่อโดเมนที่ซื้อจาก **GoDaddy** เข้ากับ CRM ที่รันบน **Windows VPS** ตัวเดียว
(รันครบทั้ง frontend + backend และ lufy) โดยมี **Caddy** เป็นตัวจัดการโดเมน + HTTPS ฟรี

> แทนคำว่า `yourdomain.com` ทุกที่ด้วยโดเมนจริงของคุณ และ `<VPS_IP>` ด้วย IP ของ VPS

---

## ✅ สิ่งที่ต้องมี
- Windows VPS (มี IP สาธารณะ) — ✔ ซื้อแล้ว
- โดเมนที่ GoDaddy — ✔ ซื้อแล้ว
- Node.js 20 LTS, Git, PM2, Caddy (ติดตั้งบน VPS ตามขั้นตอนล่าง)
- Firebase service account JSON (จาก FIREBASE_SETUP.md Step 3)

---

## Step 1 — เตรียม VPS
1. รีโมทเข้า VPS (Remote Desktop)
2. ติดตั้ง:
   - **Node.js 20 LTS** → https://nodejs.org
   - **Git** → https://git-scm.com
   - **Caddy** (Windows) → https://caddyserver.com/download (ได้ `caddy.exe` มา)
   - **PM2**: เปิด PowerShell → `npm i -g pm2`
3. เปิดพอร์ตขาเข้า **80** และ **443** ที่:
   - **Windows Firewall** (Inbound Rules → New Rule → Port → 80,443 → Allow)
   - **Firewall ของผู้ให้บริการ VPS** (บาง provider มี panel แยก)
   > พอร์ต 3000/4000/3001/3002 **ไม่ต้องเปิด** ออกเน็ต — ให้ Caddy คุยกับมันภายในเครื่องเท่านั้น
4. ถ้ามี IIS รันอยู่และจับพอร์ต 80 → ปิดบริการ **World Wide Web Publishing Service** (ไม่งั้นชนกับ Caddy)

---

## Step 2 — เอาโค้ดขึ้น VPS
```powershell
cd C:\
git clone <repo-url> CRM      # หรือก๊อปโฟลเดอร์ CRM ทั้งอันขึ้นมา
cd C:\CRM
```

ติดตั้ง dependency ให้ครบ 4 แอป:
```powershell
cd backend; npm install; npx prisma generate; cd ..
cd frontend; npm install; cd ..
cd modules\lufy\backend; npm install; npx prisma generate; cd ..\..\..
cd modules\lufy\frontend; npm install; cd ..\..\..
```

---

## Step 3 — ตั้งค่า .env (สำคัญ!)

**`backend\.env`** — คัดลอกจาก `.env.example` แล้วใส่ค่าจริง:
```
NODE_ENV="production"
DATABASE_URL="file:./prisma/dev.db"          # SQLite (คงเดิม)
FIREBASE_PROJECT_ID="crmlao"
FIREBASE_SERVICE_ACCOUNT_JSON="<base64 ของ service account>"   # ดู FIREBASE_SETUP.md Step 3
JWT_SECRET="<สุ่มยาวๆ ของจริง>"
JWT_REFRESH_SECRET="<สุ่มยาวๆ อีกตัว>"
COMETAPI_KEY="<key จริง>"
# ... ค่าอื่นๆ ตาม .env.example (SlipOK, SMS ฯลฯ)
```

**`frontend\.env.local`**:
```
NEXT_PUBLIC_API_URL="http://localhost:4000"     # ใช้ตอน Next เรนเดอร์ฝั่ง server
NEXT_PUBLIC_WS_URL="https://yourdomain.com"     # socket ต่อ same-origin ผ่าน Caddy
NEXT_PUBLIC_LUFY_URL="https://link.yourdomain.com"   # ใส่ถ้าจะเปิด lufy (ไม่ใช้ก็เว้นไว้)
# ค่า Firebase public มี default ในโค้ดแล้ว ไม่ต้องใส่ก็ได้
```

---

## Step 4 — Build (production)
```powershell
cd C:\CRM\backend;               npm run build      # tsc → dist/
cd C:\CRM\frontend;              npm run build      # next build
cd C:\CRM\modules\lufy\backend;  npm run build
cd C:\CRM\modules\lufy\frontend; npm run build
cd C:\CRM
```
> ⚠️ ถ้าแก้ค่า `NEXT_PUBLIC_*` ทีหลัง ต้อง `npm run build` frontend ใหม่ทุกครั้ง (ค่าถูกฝังตอน build)

---

## Step 5 — รันแอปให้ค้างด้วย PM2
```powershell
cd C:\CRM
pm2 start ecosystem.config.js
pm2 save
pm2 status                      # ควรเห็น 4 แอป online
```
ให้ PM2 start เองตอนรีบูต Windows:
```powershell
npm i -g pm2-windows-startup
pm2-startup install
pm2 save
```

---

## Step 6 — ตั้ง DNS ที่ GoDaddy 🖱️
1. เข้า GoDaddy → **My Products** → โดเมน → **DNS / Manage DNS**
2. เพิ่ม/แก้ record:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@`   | `<VPS_IP>` | 600 |
| A | `www` | `<VPS_IP>` | 600 |
| A | `link` | `<VPS_IP>` | 600 | ← ใส่เพิ่มถ้าจะเปิด lufy |

3. **ลบ** record A เดิมที่ GoDaddy ชี้ไปหน้า parking และปิด **Domain Forwarding** ถ้าเปิดอยู่
4. รอ DNS propagate (5 นาที – 1 ชม.) เช็คด้วย `nslookup yourdomain.com`

---

## Step 7 — เปิด Caddy (โดเมน + HTTPS)
1. แก้ `deploy\Caddyfile` → เปลี่ยน `example.com` เป็น `yourdomain.com`
2. รันทดสอบ:
```powershell
cd C:\CRM\deploy
caddy run --config Caddyfile
```
Caddy จะขอใบ SSL อัตโนมัติ (ต้องให้ DNS ชี้มาถูกก่อน + พอร์ต 80/443 เปิด) — เสร็จแล้วเปิด `https://yourdomain.com` ได้เลย
3. ให้ Caddy รันเป็น service ถาวร (ไม่ต้องเปิดหน้าต่างค้าง) — ใช้ **NSSM**:
```powershell
# ดาวน์โหลด nssm.exe แล้ว
nssm install caddy "C:\path\to\caddy.exe" "run --config C:\CRM\deploy\Caddyfile"
nssm start caddy
```

---

## Step 8 — Firebase: อนุญาตโดเมนใหม่ 🖱️ (ไม่งั้น login พัง)
Firebase Console → โปรเจกต์ **crmlao** → **Authentication** → **Settings** → **Authorized domains** → **Add domain**
เพิ่ม: `yourdomain.com` (และ `www.yourdomain.com`)

---

## ⚠️ ก่อนเปิดสู่สาธารณะ
- ✅ **ช่องโหว่ `/api/sync` แก้แล้ว** (2026-07-02) — ตอนนี้ `x-api-key` ต้องตรงกับ key ราย tenant (เทียบ hash แบบ constant-time) ถึงจะ sync ได้
  → **ต้องสร้าง key ก่อนใช้:** เข้า **⚙️ ตั้งค่า → 📥 Import ข้อมูล → แท็บ 🔌 API** กด "สร้าง Key" แล้วเอา key ไปใส่ในระบบเกม (header `x-api-key`) ไม่งั้น sync จะขึ้น 401
- ตั้ง `ALLOW_LEGACY_JWT="false"` ใน backend/.env เมื่อทุกคนเข้าผ่าน Firebase ได้แล้ว

---

## 🔁 อัปเดตโค้ดครั้งถัดไป
```powershell
cd C:\CRM
git pull
cd backend; npm install; npm run build; cd ..
cd frontend; npm install; npm run build; cd ..
pm2 restart all
```

---

## 🧩 เช็คด่วนเวลามีปัญหา
| อาการ | เช็ค |
|------|------|
| เปิดโดเมนแล้ว timeout | DNS ยังไม่ propagate / firewall 80,443 ไม่ได้เปิด |
| ขึ้น "your connection is not private" | Caddy ยังออกใบ SSL ไม่เสร็จ — ดู log ของ caddy (DNS ต้องชี้ถูกก่อน) |
| login Google เด้ง `auth/unauthorized-domain` | ยังไม่เพิ่มโดเมนใน Firebase Authorized domains (Step 8) |
| หน้าเว็บขึ้นแต่ realtime ไม่มา | `NEXT_PUBLIC_WS_URL` ไม่ตรงโดเมน / Caddy ไม่ได้ route `/socket.io/*` |
| แอปดับหลังปิด Remote Desktop | ยังไม่ได้ตั้ง `pm2-startup` + `pm2 save` |
