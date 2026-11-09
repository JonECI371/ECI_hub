import type { Metadata } from 'next';
import { Mulish } from 'next/font/google';
import { SITE_URL } from '@/lib/format';
import './globals.css';

const mulish = Mulish({ subsets: ['latin'], weight: ['400', '600', '700', '800'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ECI-Hub | EC&I safety training and consultancy', template: '%s | ECI-Hub' },
  description: 'Accredited CompEx, EUSR, Thames Water, DSEAR and process safety training, and specialist consultancy for high-hazard sites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={mulish.className}>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
