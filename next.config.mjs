import { readFileSync } from 'node:fs';

// Old eci-hub.co.uk addresses that now live somewhere else (301). See src/lib/old-site-redirects.ts.
const oldSite = JSON.parse(readFileSync(new URL('./src/lib/old-site-redirects.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output keeps the Docker image small for AWS Fargate.
  output: 'standalone',
  poweredByHeader: false,
  images: { formats: ['image/avif', 'image/webp'] },
  // Registration forms upload a photo and photo ID (up to 10MB each).
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async redirects() {
    return Object.entries(oldSite).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
