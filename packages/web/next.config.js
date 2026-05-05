/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5500/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:5500/ws/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
