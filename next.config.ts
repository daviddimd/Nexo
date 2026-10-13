import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, devIndicators: false, output: 'standalone', distDir: process.env.NEXO_DEV_DIST_DIR??'.next' };
export default config;
