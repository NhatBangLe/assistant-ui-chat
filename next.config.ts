import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			new URL('https://bangnhatle.id.vn/threads/**'),
			new URL('http://bangnhatle.id.vn/threads/**'),
			new URL('http://127.0.0.1:8000/threads/**'),
		],
	},
};

export default nextConfig;
