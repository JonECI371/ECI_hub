/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output keeps the Docker image small for AWS Fargate.
  output: 'standalone',
  poweredByHeader: false,
  images: { formats: ['image/avif', 'image/webp'] },
};

export default nextConfig;
