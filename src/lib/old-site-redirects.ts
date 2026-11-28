// 301 redirects from the old eci-hub.co.uk (WordPress) addresses to their new pages.
// The list lives in old-site-redirects.json so next.config.mjs can read it too.
// Built from the old site's own sitemaps on 25 Nov 2026. Where the new site has no equivalent
// page yet, the visitor goes to the closest listing, never to an error page. When a missing
// course or page is added, change its line in the JSON so it points at the new page.
import map from './old-site-redirects.json';

/** Old path (no trailing slash) to new path. */
export const OLD_SITE_REDIRECTS: Record<string, string> = map;
