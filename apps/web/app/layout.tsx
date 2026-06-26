import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
// Suppress TS error when no type declarations exist for global CSS side-effect import
// @ts-ignore
import './globals.css';

export const metadata: Metadata = {
  title: 'Clinch - Trustless Agreements on Arc Network',
  description:
    'Trustless escrow infrastructure for serious agreements, AI-assisted dispute coordination, and stablecoin-native settlement on Arc.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#07080F' },
    { media: '(prefers-color-scheme: light)', color: '#F0F2FF' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
        try {
          const t = localStorage.getItem('clinch-theme') || 'dark';
          document.documentElement.classList.add(t);
        } catch(e) {
          document.documentElement.classList.add('dark');
        }
      `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=DM+Sans:ital,opsz,wght@0,9..40,100..900;1,9..40,100..900&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-void font-sans text-text-primary antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
