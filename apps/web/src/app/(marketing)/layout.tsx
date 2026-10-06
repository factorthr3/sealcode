import { Analytics } from '@/components/analytics';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { GTAG_INIT, GTAG_SRC } from '@/lib/analytics';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Google tag with Consent Mode: cookies stay off until the visitor accepts. */}
      <script async src={GTAG_SRC} />
      <script dangerouslySetInnerHTML={{ __html: GTAG_INIT }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
      <Analytics />
    </>
  );
}
