# lufy.cc — โมดูลย่อยใน CRM

โปรเจกต์ `lufy.cc` (ระบบย่อลิงก์ + วิเคราะห์การคลิก) ถูกย้ายมาไว้ที่
`E:\CRM\modules\lufy` และเชื่อมเข้ากับ CRM เป็น **โมดูลแยก** — ยังใช้
แอป / ฐานข้อมูล / ระบบล็อกอินของตัวเอง ไม่ได้รวมเข้ากับ Firebase/tenant ของ CRM

## พอร์ตที่ใช้ (กันชนกัน)
| ส่วน              | พอร์ต |
|-------------------|-------|
| CRM frontend      | 3000  |
| lufy backend      | 3001  |
| lufy frontend     | 3002  ← เปลี่ยนจากเดิม 3000 เพื่อไม่ชน CRM |
| CRM backend       | 4000  |

## วิธีรันโมดูล lufy
เปิด 2 เทอร์มินัล:

```bash
# 1) lufy backend (API + ตัว redirect /:slug)  → http://localhost:3001
cd E:\CRM\modules\lufy\backend
npm install      # ครั้งแรกเท่านั้น
npm run dev

# 2) lufy frontend (หน้าจัดการ)  → http://localhost:3002
cd E:\CRM\modules\lufy\frontend
npm install      # ครั้งแรกเท่านั้น
npm run dev
```

> ฐานข้อมูลเป็น SQLite อยู่ที่ `backend/prisma/lufy.db` (ย้ายตามมาแล้ว ใช้ได้เลย)

## เข้าใช้งานจาก CRM
1. รัน CRM frontend (พอร์ต 3000) และรันโมดูล lufy ตามด้านบน
2. เข้า CRM → ดูที่ sidebar จะมีเมนูใหม่ **🔗 ลิงก์ (lufy.cc)**
3. คลิกเมนู → หน้า `/lufy` จะฝัง UI ของ lufy ผ่าน iframe
4. ถ้าเบราว์เซอร์บล็อกคุกกี้ของ iframe (third-party cookie) จนล็อกอินไม่ได้
   ให้กดปุ่ม **↗ เปิดในแท็บใหม่** เพื่อใช้งานแบบเต็มจอที่ http://localhost:3002

## ไฟล์ฝั่ง CRM ที่ถูกแก้เพื่อต่อเมนูนี้
- `frontend/lib/i18n.ts` — เพิ่มคีย์ `nav_lufy`
- `frontend/app/(dashboard)/layout.tsx` — เพิ่มเมนู `/lufy` ใน sidebar
- `frontend/app/(dashboard)/lufy/page.tsx` — หน้าใหม่ที่ฝัง lufy ผ่าน iframe
- `frontend/.env.local` — เพิ่ม `NEXT_PUBLIC_LUFY_URL` (ค่าเริ่มต้น http://localhost:3002)

## เปลี่ยน URL ของ lufy ตอน deploy จริง
แก้ `NEXT_PUBLIC_LUFY_URL` ใน `E:\CRM\frontend\.env.local` ให้ชี้ไปโดเมนจริง
ของ lufy แล้ว build CRM frontend ใหม่
