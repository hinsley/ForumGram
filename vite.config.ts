import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';

function r(p: string) {
	return fileURLToPath(new URL(p, import.meta.url));
}

export default defineConfig({
	plugins: [
		react(),
		nodePolyfills({
			protocolImports: true,
			globals: { Buffer: true, global: true, process: true },
		}),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icon.svg'],
			devOptions: {
				enabled: true,
			},
			manifest: {
				name: 'ForumGram',
				short_name: 'ForumGram',
				description: 'Forums-only Telegram client (PWA)',
				start_url: '/',
				display: 'standalone',
				background_color: '#0b1220',
				theme_color: '#0ea5e9',
				icons: [
					{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
				],
			},
			workbox: {
				navigateFallback: '/index.html',
				maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
				globPatterns: ['**/*.{js,css,html,woff2,woff,ttf,svg,png,jpg,jpeg}'],
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.destination === 'image',
						handler: 'CacheFirst',
						options: {
							cacheName: 'images',
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
						},
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			'@app': r('./src/app'),
			'@components': r('./src/components'),
			'@features': r('./src/features'),
			'@lib': r('./src/lib'),
			'@state': r('./src/state'),
			'@workers': r('./src/workers'),
			'@styles': r('./src/styles'),
		},
	},
	server: {
		port: 5173,
		strictPort: true,
	},
	preview: {
		port: 5173,
		strictPort: true,
	},
	build: {
		target: 'es2020',
	},
});