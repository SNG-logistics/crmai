# 🔥 Firebase Setup Guide — CRM (project: `crmlao`)

คู่มือนี้ครอบคลุมการเปิดใช้ **Login ผ่าน Firebase** (Google + Email/Password), การตั้ง
**owner = kengplsz@gmail.com**, และการ **deploy ขึ้น Firebase Hosting + Cloud Run**

> ขั้นตอนที่ต้องทำใน **Console** (กดเองในเว็บ) จะมีป้าย 🖱️ — ส่วนพวกนี้โค้ดทำแทนไม่ได้

---

## ภาพรวมสิ่งที่เปลี่ยน

| ส่วน | เดิม | ใหม่ |
|------|------|------|
| Login | username/password (JWT เขียนเอง) | **Firebase Auth**: Google + Email/Password |
| สร้าง user | ใน DB | **Firebase Auth เท่านั้น** (admin สร้างผ่านระบบ → provision เข้า Firebase, ไม่มีสมัครเอง) |
| ตรวจ token (backend) | `jwt.verify` | `firebase-admin` ตรวจ ID token (+ มี legacy JWT fallback ชั่วคราว) |
| สิทธิ์/tenant | อยู่ใน JWT | เก็บใน **Firebase custom claims** (`tenantId`, `role`, `userId`) |

ระบบทำงานแบบ **dual-mode**: Login เดิมยังใช้ได้จนกว่าจะตั้ง `ALLOW_LEGACY_JWT=false` (กันล็อกตัวเองออกระหว่างเปลี่ยน)

---

## ✅ Step 1 — ตั้ง kengplsz@gmail.com เป็น Owner 🖱️

1. เปิด [Firebase Console](https://console.firebase.google.com/) → เลือกโปรเจกต์ **crmlao**
2. ไอคอนเฟือง ⚙️ ข้างบน → **Project settings** → แท็บ **Users and permissions**
3. กด **Add member** → ใส่ `kengplsz@gmail.com` → role = **Owner** → **Add member**

> หรือทำที่ [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam): Grant access → `kengplsz@gmail.com` → role **Owner**

---

## ✅ Step 2 — เปิด Sign-in providers 🖱️

Console → **Authentication** → **Get started** (ถ้ายังไม่เคยเปิด) → แท็บ **Sign-in method**

1. **Google** → Enable → เลือก support email = `kengplsz@gmail.com` → Save
2. **Email/Password** → Enable → Save  *(ไม่ต้องเปิด Email link)*
3. แท็บ **Settings → Authorized domains** → ตรวจว่ามี `localhost` (มีอยู่แล้ว) และเพิ่ม domain ของ production เช่น `crmlao.web.app`, `crmlao.firebaseapp.com` และ custom domain (ถ้ามี)

> ℹ️ ระบบเราไม่มีหน้าสมัครสมาชิกสาธารณะ ดังนั้น “สร้าง user ได้เฉพาะใน Firebase” จึงเป็นจริงโดยอัตโนมัติ — user ใหม่ถูกสร้างโดย admin ผ่านหน้า Team หรือสคริปต์เท่านั้น

---

## ✅ Step 3 — Service Account สำหรับ backend 🖱️ + แก้ `.env`

1. Console → ⚙️ **Project settings** → แท็บ **Service accounts** → **Generate new private key** → ได้ไฟล์ `.json`
2. เลือกวิธีใดวิธีหนึ่ง:

**วิธี A — ใส่เป็น env เดียว (เหมาะกับ Cloud Run):** แปลงไฟล์เป็น base64
```powershell
# Windows PowerShell (ในโฟลเดอร์ที่มีไฟล์ json)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("crmlao-xxxxx.json")) | Set-Clipboard
```
แล้ววางใน `backend/.env`:
```
FIREBASE_PROJECT_ID="crmlao"
FIREBASE_SERVICE_ACCOUNT_JSON="<วาง base64 ที่ copy มา>"
```

**วิธี B — ใช้ไฟล์:** วางไฟล์ไว้ที่ `backend/serviceAccount.json` แล้วตั้ง
```
FIREBASE_PROJECT_ID="crmlao"
GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json"
```
> ⚠️ **ห้าม commit** ไฟล์ service account / ค่า base64 ลง git (เป็นความลับ) — ใส่ `.gitignore` แล้ว

---

## ✅ Step 4 — Frontend env (มีค่า default ให้แล้ว)

ค่า config ของ `crmlao` ถูกฝังเป็น default ในโค้ดแล้ว (เป็น public ปลอดภัย) จะรันได้เลย
ถ้าต้องการ override ให้ก๊อป `frontend/.env.local.example` → `frontend/.env.local`

---

## ✅ Step 5 — อัปเดต Database schema (เพิ่มคอลัมน์ลิงก์ Firebase)

เพิ่มฟิลด์ `firebaseUid` และทำให้ `passwordHash` เป็น optional:
```powershell
cd backend
npx prisma migrate dev --name add_firebase_auth
npx prisma generate
```
> เป็นการเพิ่มคอลัมน์ใหม่ (nullable) ข้อมูลเดิมไม่หาย

---

## ✅ Step 6 — สร้าง Owner (kengplsz@gmail.com) ใน Firebase + DB

ตั้งค่าใน `backend/.env` (มีใน `.env.example` แล้ว):
```
OWNER_EMAIL="kengplsz@gmail.com"
OWNER_TENANT_SLUG="demo"
OWNER_PASSWORD=""          # เว้นว่าง = login ด้วย Google อย่างเดียว / ใส่รหัส = login ได้ทั้ง 2 แบบ
```
แล้วรัน:
```powershell
cd backend
npm run setup-owner
```
สคริปต์จะ: สร้าง/อัปเดต user เป็น **superadmin**, สร้างบัญชีใน Firebase Auth, ใส่ custom claims และลิงก์ `firebaseUid` ให้อัตโนมัติ

---

## ✅ Step 7 — ทดสอบในเครื่อง

```powershell
# Terminal 1
cd backend ; npm run dev
# Terminal 2
cd frontend ; npm run dev
```
เปิด http://localhost:3000/login แล้วลอง:
- **เข้าสู่ระบบด้วย Google** (ใช้ kengplsz@gmail.com)
- หรือ **อีเมล/รหัสผ่าน** (ถ้าตั้ง `OWNER_PASSWORD`)

ถ้าเข้าด้วยบัญชี Google ที่ยังไม่ถูก provision → ระบบจะเด้งข้อความ “บัญชีนี้ยังไม่ได้รับสิทธิ์…” (เป็นพฤติกรรมที่ถูกต้อง)

---

## 👤 การสร้าง user เพิ่ม (admin เท่านั้น)

มี 2 ทาง — ทั้งคู่ provision เข้า Firebase ให้อัตโนมัติ:
1. **ผ่านหน้าเว็บ:** เมนู Settings → Team → เพิ่มผู้ใช้ (ต้องเป็น role admin/superadmin)
2. **ผ่าน Firebase Console** 🖱️: Authentication → Users → Add user → จากนั้นให้ user ลอง login (ระบบจะลิงก์ด้วยอีเมลในครั้งแรก) — *แต่ต้องมี record ใน tenant ก่อน* แนะนำให้ใช้ทางที่ 1 หรือสคริปต์ `setup-owner` เป็นต้นแบบ

---

## 🚀 Step 8 — Deploy (ทำเมื่อพร้อม)

### 8.1 Frontend → Firebase Hosting
```powershell
npm install -g firebase-tools
firebase login            # ล็อกอินด้วย kengplsz@gmail.com
firebase experiments:enable webframeworks
# ตั้ง URL ของ backend (Cloud Run) ให้ frontend เรียกถูก
$env:NEXT_PUBLIC_API_URL="https://<cloud-run-backend-url>"
$env:NEXT_PUBLIC_WS_URL="https://<cloud-run-backend-url>"
firebase deploy --only hosting
```
Firebase จะ build Next.js (SSR) ให้เองตาม `firebase.json`

### 8.2 Backend → Cloud Run
> ต้องเปิด **Blaze (pay-as-you-go) billing** ก่อน 🖱️

```powershell
cd backend
gcloud run deploy crm-backend `
  --source . `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --set-env-vars NODE_ENV=production,FIREBASE_PROJECT_ID=crmlao
# ตั้งค่า secret อื่น ๆ (FIREBASE_SERVICE_ACCOUNT_JSON, COMETAPI_KEY, ฯลฯ) ผ่าน
# --set-env-vars หรือ Secret Manager
```

### ⚠️ ข้อจำกัดสำคัญก่อน deploy backend
ดิสก์ของ Cloud Run เป็นแบบ **ephemeral** (หายเมื่อ restart/scale) — ส่วนที่เขียนไฟล์ลงดิสก์จะใช้ไม่ได้:

| ของเดิม (เขียนลงดิสก์) | ต้องย้ายไป |
|------|------|
| **SQLite** (`prisma/dev.db`) | **Cloud SQL (Postgres)** → แก้ `datasource db` ใน `schema.prisma` เป็น `postgresql` + `DATABASE_URL` |
| **WhatsApp creds** (`auth_whatsapp/`) | persistent store หรือคงไว้บน VM |
| **/uploads** (รูป/สลิป) | **Cloud Storage / Firebase Storage** |

จนกว่าจะย้าย DB → แนะนำให้รัน backend บน VM/เครื่องเดิมไปก่อน (deploy เฉพาะ frontend ขึ้น Firebase Hosting ได้เลย)

---

## 🔒 Step 9 — ปิด legacy login (หลังย้ายเสร็จ)

เมื่อทุกคนเข้าผ่าน Firebase ได้แล้ว ตั้งใน `backend/.env`:
```
ALLOW_LEGACY_JWT="false"
```
แล้ว restart backend — ตั้งแต่นั้น token เดิม (JWT) จะใช้ไม่ได้อีก เหลือแต่ Firebase

---

## 🔐 หมายเหตุด้านความปลอดภัย (สำคัญ)

ระบบ auth ผ่านการรีวิวแบบ adversarial หลายรอบ ปิดช่องโหว่ cross-tenant / account-takeover / lockout ไปแล้ว เหลือ 3 เรื่องที่ควรรู้:

1. **ตั้ง secret จริงทั้งคู่** — `JWT_SECRET` **และ** `JWT_REFRESH_SECRET` ต้องไม่ใช่ค่า placeholder จาก `.env.example` ถ้ายังเป็น placeholder ระบบจะ**ปิด legacy login อัตโนมัติ** (กันการปลอม token) เหลือเฉพาะ Firebase

2. **⚠️ ช่องโหว่เดิม (ไม่เกี่ยวกับ Firebase) — `/api/sync`**: ใน [backend/src/routes/sync.ts](backend/src/routes/sync.ts) มี `syncAuth()` ที่รับ header `x-api-key` แต่**ยังไม่ตรวจสอบค่า** (มี `// TODO: validate apiKey`) และเชื่อ `x-tenant-id` จาก header ตรงๆ → ใครก็ได้ที่ส่ง `x-api-key` (อะไรก็ได้) + `x-tenant-id` ของ tenant เป้าหมาย สามารถเขียนข้อมูล contact/financial เข้า tenant นั้นได้โดยไม่ต้อง login **เรื่องนี้มีมาก่อนการย้าย Firebase** ผมไม่ได้แก้ให้อัตโนมัติเพราะอาจกระทบ integration ที่เรียก sync อยู่ — **แนะนำให้แก้ก่อนเปิดสู่อินเทอร์เน็ต** (ตรวจ `x-api-key` กับ secret ต่อ tenant แบบ constant-time ก่อนเชื่อ `x-tenant-id`) บอกผมได้ถ้าให้แก้

3. **ข้อจำกัด multi-tenant กับ Firebase project เดียว**: Firebase ใช้ "อีเมล" ร่วมกันทั้งโปรเจกต์ แต่ระบบเราแยก user ราย tenant (`@@unique([tenantId, email])`) ถ้าวันหนึ่งคุณรันหลายองค์กรแยกกันจริงๆ admin ของ tenant หนึ่งอาจ "จอง" อีเมลในระดับ Firebase ได้ → **ถ้าต้องการแยกองค์กรเด็ดขาด ให้ใช้ Firebase project แยกต่อ tenant** สำหรับการใช้งานองค์กรเดียว (กรณีของคุณตอนนี้) เรื่องนี้ไม่มีผล

---

## 🧩 Troubleshooting

| อาการ | สาเหตุ/วิธีแก้ |
|------|------|
| `Firebase Admin init failed` ตอน start backend | ยังไม่ได้ตั้ง `FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` → ดู Step 3 (ระบบจะวิ่ง legacy mode ไปก่อน) |
| login แล้วเด้ง “ยังไม่ได้รับสิทธิ์” | บัญชี Firebase นั้นยังไม่มี record ใน DB tenant → ใช้ `npm run setup-owner` หรือสร้างผ่านหน้า Team |
| Google popup ไม่ขึ้น/โดนบล็อก | อนุญาต popup ในเบราว์เซอร์ + เช็ค Authorized domains (Step 2.3) |
| `auth/unauthorized-domain` | เพิ่ม domain ใน Authentication → Settings → Authorized domains |
| socket ไม่ต่อหลัง 1 ชม. | แก้แล้ว — socket ดึง token ใหม่ทุกครั้งที่ reconnect |
