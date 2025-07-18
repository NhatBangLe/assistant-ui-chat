import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [new URL('https://bangnhatle.id.vn/api/v1/images/**')],
	},
};

export default nextConfig;
