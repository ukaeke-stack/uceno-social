import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: 'UCENO — Your world, connected', description: 'A fresh home for conversations, communities and the people who matter.', applicationName: 'UCENO' };
export const viewport: Viewport = { themeColor: '#10131d', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Link className="global-account-link" href="/account">Join UCENO <span>↗</span></Link></body></html>;
}
