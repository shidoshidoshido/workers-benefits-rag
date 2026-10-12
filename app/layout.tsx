import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CORPUS } from '@/lib/config';

export const metadata: Metadata = {
  title: CORPUS.appTitle,
  description: CORPUS.metaDescription,
  openGraph: {
    title: CORPUS.appTitle,
    description: CORPUS.metaDescription,
    type: 'website',
    siteName: CORPUS.appTitle,
  },
  twitter: {
    card: 'summary',
    title: CORPUS.appTitle,
    description: CORPUS.metaDescription,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
