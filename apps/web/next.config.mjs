/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@syncforge/sdk', '@syncforge/shared'],
};

export default nextConfig;
