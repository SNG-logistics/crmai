/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ─── สำคัญ: ลิงก์สั้น /:slug ต้องวิ่งไป lufy backend (:3001) ───────────────
  // Caddy ส่งทุก path ที่ไม่ใช่ /api มาที่ frontend ตัวนี้ (:3002)
  // fallback rewrite = เช็ค route ของ Next ก่อน (/, /login, /admin, /settings, /_next)
  // ถ้าไม่แมตช์ค่อย proxy ไป backend → redirect handler GET /:slug ทำงาน ไม่เจอ 404 อีก
  async rewrites() {
    return {
      fallback: [
        {
          source: '/:slug',
          destination: `${process.env.LUFY_BACKEND_URL || 'http://localhost:3001'}/:slug`,
        },
      ],
    };
  },
};

export default nextConfig;
