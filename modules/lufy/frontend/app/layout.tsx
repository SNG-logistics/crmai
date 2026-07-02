import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'lufy.cc | URL Shortener & Analytics',
  description: 'Premium URL Shortening and Deep Analytics Tracking Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#141A34',
              color: '#F8FAFC',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            },
          }}
        />
      </body>
    </html>
  );
}
