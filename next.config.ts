import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e harness builds the app in test mode (see e2e/start-web.ts) and
  // points this at .next-e2e so that throwaway build never overwrites the
  // normal .next output, and `npm start` can never serve it by accident.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '**',
      },
    ],
  },
};

export default nextConfig;
