import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: 'Clinch — Trustless Escrow on Arc Network',
  description: 'Lock money. Settle deals. No trust required. Create on-chain agreements backed by USDC escrow.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F1117',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} bg-clinch-bg-page`}>
      <body className="font-sans antialiased bg-clinch-bg-page text-clinch-text-primary">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
