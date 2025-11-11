import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@aihapoel/server'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

