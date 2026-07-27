# CRM Bank Notification Listener

แอป Android สำหรับรับ Notification จากแอปธนาคารที่ผู้ดูแลอนุญาตแบบระบุ package
ตรงตัว แล้วส่งหลักฐานไปยัง CRM เพื่อใช้ประกอบการตรวจสลิป แอปนี้ไม่อ่าน SMS,
ไม่ใช้ Accessibility, ไม่จับภาพหน้าจอ และไม่ตัดสินว่าสลิปจริงด้วยตัวเอง

## ความสามารถ

- รับ Notification ผ่าน `NotificationListenerService` หลังผู้ใช้เปิดสิทธิ์เอง
- ส่งเฉพาะ package ที่อยู่ใน allowlist แบบ exact match; allowlist ว่างจะไม่ส่งอะไร
- ส่งออกจากเครื่องเฉพาะรายการ `credit` ที่มียอดบวกและระบุสกุลเงินได้
  รายการ debit/unknown/marketing และข้อความที่มี OTP/รหัสยืนยันจะถูกทิ้งบนเครื่อง
- ดึง `title`, `text`, `bigText`, `textLines`, เวลาโพสต์ และ notification key
- แยกเบื้องต้น: เงินเข้า/ออก, ยอดเงิน, THB/LAK/USD, เลขอ้างอิง,
  ท้ายบัญชี, ผู้โอน และคำใบ้ธนาคาร
- เก็บ device secret ด้วย Android Keystore
- เข้ารหัสไฟล์คิวด้วย AES-GCM และส่งซ้ำด้วย WorkManager เมื่อเครือข่ายกลับมา
- เมื่อเปลี่ยน Server URL หรือ Device ID แอปจะยกเลิกงานส่งและล้างคิวของ enrollment
  เดิมก่อนบันทึกค่าใหม่ การอัปเดต secret ของ Device ID เดิมจะคงคิวไว้โดยตั้งใจ
- เซ็น request ด้วย HMAC-SHA256; ไม่มีเนื้อหา Notification ใน application log
- ไม่ตาม HTTP redirect สำหรับ signed payload; Server URL ต้องเป็น HTTPS origin สุดท้าย
- หน้าตั้งค่าใช้ `FLAG_SECURE` เพื่อกันภาพหน้าจอและภาพใน recent apps
- แนบ SHA-256 ของ signing certificate และ version ของแอปต้นทางเป็นหลักฐาน
  ฝั่งเซิร์ฟเวอร์ TOFU-pin signer แรกที่ถูกต้องแยกตาม package และปฏิเสธค่า signer
  ที่เปลี่ยนภายหลัง การหมุน device secret จะรีเซ็ต signer pins ของอุปกรณ์นั้น

## ตั้งค่าเครื่อง

1. สร้างอุปกรณ์ในหน้า CRM แล้วคัดลอก `Device public ID` และ `Device secret`
2. ติดตั้ง APK แล้วกรอก Server URL แบบ HTTPS
3. ใส่ชื่อ package ของแอปธนาคาร คั่นด้วย comma หรือขึ้นบรรทัดใหม่
4. กด **บันทึกการตั้งค่า** และ **ทดสอบการเชื่อมต่อ**
5. กด **เปิดสิทธิ์เข้าถึงการแจ้งเตือน** แล้วเปิดสิทธิ์ให้ CRM Bank Watch

ควรยืนยันชื่อ package จากอุปกรณ์จริง ไม่ควรเดาจากชื่อธนาคาร ตัวอย่างคำสั่งสำหรับ
เครื่องที่เปิด USB debugging:

```powershell
adb shell pm list packages | Select-String -Pattern "bank|scb|bcel"
```

## API contract

แอปส่ง:

```text
POST {serverUrl}/api/bank-notifications/ingest
Content-Type: application/json; charset=utf-8
x-bank-device-id: <public id>
x-bank-timestamp: <Unix epoch seconds>
x-bank-nonce: <UUID>
x-bank-signature: <lowercase HMAC-SHA256 hex>
```

ข้อความที่ใช้เซ็นคือ byte UTF-8 เดียวกับ body ที่ส่งจริง:

```text
{timestamp}\n{nonce}\n{exact JSON body}
```

body มี `eventId`, `packageName`, `notificationKey`, `postedAt`, `capturedAt`,
`title`, `text`, `bigText`, `textLines`, `parsed`, `test`, `signerSha256`
และ `appVersion` โดย `parsed.amount` เป็น JSON number หรือ `null`

## Build

ต้องใช้ JDK 17, Android SDK Platform 35 และ Build Tools 35.x:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug assembleRelease
```

ไฟล์ debug อยู่ที่:

```text
app/build/outputs/apk/debug/app-debug.apk
```

ไฟล์ release ที่ Gradle สร้างโดยค่าเริ่มต้นยังไม่ได้เซ็น:

```text
app/build/outputs/apk/release/app-release-unsigned.apk
```

ก่อนนำขึ้นใช้งานจริงให้สร้าง signing key ที่เก็บอย่างปลอดภัย ตั้งค่า signing config
นอก repository และแจกเฉพาะ APK/AAB ที่เซ็นแล้ว ห้าม commit keystore หรือรหัสผ่าน

แอป sideload ภายในนี้ประกาศ `QUERY_ALL_PACKAGES` เพื่ออ่าน signing certificate
ของ package ธนาคารที่แอดมินเพิ่มภายหลัง หากจะเผยแพร่ผ่าน Google Play ต้องตรวจนโยบาย
และขออนุมัติสิทธิ์นี้ หรือเปลี่ยนเป็นรายการ package คงที่ใน manifest

## ข้อจำกัดด้านความปลอดภัย

ตัวกรองทำงานก่อนเขียนคิว: มีเพียง credit + ยอดบวก + สกุลเงินเท่านั้นที่เข้าคิว
ข้อความ OTP, debit, unknown และ marketing จะถูกทิ้งบนเครื่อง

Notification เป็นหลักฐานอีกชั้นหนึ่ง ไม่ใช่หลักฐานสมบูรณ์ แอปที่ถูกดัดแปลงหรือเครื่อง
ที่ถูก root อาจปลอมข้อมูลได้ ฝั่ง CRM จึงควรตรวจ HMAC/replay, จำกัด package,
เปรียบเทียบจำนวนเงิน + เลขอ้างอิง + เวลา + บัญชีรับ, ไม่ยืนยันจากยอดเงินอย่างเดียว
และให้รายการกำกวมรอแอดมินตรวจ
