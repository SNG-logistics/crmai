// PM2 process manager — รันทั้ง 4 แอปให้ค้างตลอด + รีสตาร์ทเองเมื่อล่ม/รีบูต
// ใช้บน VPS (Windows หรือ Linux):
//   npm i -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save            # จำ process ไว้
//   pm2 startup         # ให้ start เองตอนเปิดเครื่อง (Linux) ; Windows ดู DEPLOY.md
//
// ⚠️ ต้อง build ก่อน (ดู DEPLOY.md): backend/lufy-backend => npm run build , frontend/lufy-frontend => npm run build
module.exports = {
  apps: [
    {
      name: 'crm-backend',
      cwd: './backend',
      script: './dist/index.js',
      env: { NODE_ENV: 'production', PORT: 4000 },
      autorestart: true,
      max_restarts: 20,
    },
    {
      name: 'crm-frontend',
      cwd: './frontend',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 20,
    },
    // ─── lufy (โมดูลย่อลิงก์) — เปิดใช้ถ้าจะเสิร์ฟบน subdomain เช่น link.yourdomain.com ───
    {
      name: 'lufy-backend',
      cwd: './modules/lufy/backend',
      script: './dist/index.js',
      env: { NODE_ENV: 'production', PORT: 3001 },
      autorestart: true,
      max_restarts: 20,
    },
    {
      name: 'lufy-frontend',
      cwd: './modules/lufy/frontend',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 20,
    },
  ],
};
