import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), geolocation=(), microphone=(self)',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/reading/articles/*': ['./scripts/sudachi_pronunciation.py'],
    '/practice/*': ['./scripts/sudachi_pronunciation.py'],
  },
  // The local Sudachi virtualenv is a development runtime, not a deployable
  // asset. Its Python symlink can point outside the project tracing root.
  outputFileTracingExcludes: {
    '/*': ['./.venv/**/*'],
  },
  // Allow devices on the local network to load the dev client from this Mac.
  // This must contain the hostname in the page URL, not the client device IP.
  allowedDevOrigins: ['192.168.11.2', '192.168.11.12'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
