import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { Toaster } from 'sonner';
import { ToasterProvider } from '@/components/custom/ToasterProvider';
import { FloatingAnalysisButton } from '@/components/custom/FloatingSimulationButton';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Kynd',
  description: 'AI-driven persona generation and analysis.',
  icons: {
    icon: '/kynd_logo.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary`}
      >
        {children}
        <Script
          type="module"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "248113f4f5094418bd7d88a3c576b8a2"}'
          strategy="afterInteractive"
        />
        <Toaster
          position="bottom-right"
          expand
          visibleToasts={8}
          closeButton
          theme="dark"
        />
        <ToasterProvider />
        <FloatingAnalysisButton />
      </body>
    </html>
  );
}
