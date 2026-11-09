/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output keeps the Docker image small for AWS Fargate.
  output: 'standalone',
  poweredByHeader: false,
  images: { formats: ['image/avif', 'image/webp'] },
  // Registration forms upload a photo and photo ID (up to 10MB each).
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
};

export default nextConfig;
