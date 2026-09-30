import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Sealcode: confidential AI coding, with receipts',
    template: '%s · Sealcode',
  },
  description:
    'Use Claude Code, OpenCode, Cline and Continue with strong open models running inside hardware enclaves. Every response comes with a verifiable receipt. Built for regulated engineering teams.',
  openGraph: { siteName: 'Sealcode', type: 'website' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0b111c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
