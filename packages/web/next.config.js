const path = require('path');

// Sprint 9.4: where the same-origin /api and /ws rewrites proxy to. Only
// relevant when NEXT_PUBLIC_API_URL is empty (the browser then calls the web
// origin and Next forwards). Rewrites are resolved at BUILD time, so set this
// as a build arg in Docker (docker-compose passes http://api:5500).
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:5500';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sprint 9.4: self-contained server for packages/web/Dockerfile.
  output: 'standalone',
  // Monorepo: trace files from the repo root so @tradexlabel/shared is included.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL_URL}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${API_INTERNAL_URL}/ws/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
