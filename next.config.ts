import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			new URL('https://bangnhatle.id.vn/api/v1/images/**'),
			new URL('http://127.0.0.1:8000/api/v1/images/**'),
		],
	},
};

export default nextConfig;
