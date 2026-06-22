/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@copy-trading/shared-types'],
  reactStrictMode: true,
};

module.exports = nextConfig;
