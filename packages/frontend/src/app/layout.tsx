import type { Metadata } from 'next';

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
      <body style={{
        margin: 0,
        padding: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
        backgroundColor: '#0f1117',
        color: '#e2e8f0',
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  );
}