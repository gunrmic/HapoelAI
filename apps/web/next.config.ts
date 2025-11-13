import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: ['@aihapoel/server'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);

