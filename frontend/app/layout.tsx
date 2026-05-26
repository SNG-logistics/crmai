import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM One-Stop Service",
  description: "ระบบ CRM แบบ One-Stop Service เชื่อมต่อ AI Bot กับ LINE OA และ Telegram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1A2540',
              color: '#F1F5F9',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              fontFamily: 'Kanit, Inter, sans-serif',
              fontSize: '0.875rem',
            },
            success: { iconTheme: { primary: '#00D4AA', secondary: '#0F1729' }, duration: 3000 },
            error: { iconTheme: { primary: '#EF4444', secondary: '#0F1729' }, duration: 4000 },
            loading: { iconTheme: { primary: '#7C3AED', secondary: '#0F1729' } },
          }}
        />
      </body>
    </html>
  );
}

