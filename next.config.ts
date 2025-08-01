import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			new URL('https://bangnhatle.id.vn/threads/**'),
			new URL('http://bangnhatle.id.vn/threads/**'),
			new URL('https://127.0.0.1:8000/threads/**'),
			new URL('http://127.0.0.1:8000/threads/**'),
			new URL('https://127.0.0.1:8080/threads/**'),
			new URL('http://127.0.0.1:8080/threads/**'),
		],
	},
};

export default nextConfig;
