import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tuteur Dashboard',
  description: 'Local workflow dashboard for AI coding agents',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
