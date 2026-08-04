import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'CPMind Analytics',
  description: 'CPMind impression analytics panel',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}