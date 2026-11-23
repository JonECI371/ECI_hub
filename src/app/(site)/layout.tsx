import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { siteJsonLd } from '@/lib/seo';

/** Public website: header, page, footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </>
  );
}
