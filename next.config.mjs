/** @type {import('next').NextConfig} */
const nextConfig = {
  // Edge Runtime is set per-route via export const runtime = 'edge'
  // No special config needed
  env: {
    NEXT_PUBLIC_DEPLOY_TIME: new Date().toISOString(),
  }
};

export default nextConfig;
