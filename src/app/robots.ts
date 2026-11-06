import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/format';

// AI crawlers are allowed on purpose (spec: SEO and AI visibility).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/portal', '/trainer', '/api', '/book'] },
      { userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'], allow: '/', disallow: ['/admin', '/portal', '/trainer', '/api'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
