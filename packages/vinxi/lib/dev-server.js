import { defineEventHandler, fromNodeMiddleware } from "h3";
import { createNitro } from "nitropack";
import { join } from "pathe";

import { createDevManifest } from "./manifest/dev-server-manifest.js";
import { createDevServer as createDevNitroServer } from "./nitro-dev.js";
import { css } from "./plugins/css.js";
import { manifest } from "./plugins/manifest.js";

export function getEntries(router) {
	return [
		router.handler,
		...(router.fileRouter?.routes.map((r) => r.filePath) ?? []),
	];
}

/**
 *
 * @returns {import('./vite-dev.d.ts').Plugin}
 */
function devEntries() {
	return {
		name: "vinxi:dev-entries",
		config(inlineConfig) {
			return {
				build: {
					rollupOptions: {
						input: getEntries(inlineConfig.router),
					},
				},
			};
		},
	};
}

/**
 *
 * @param {import('vite').UserConfig & { router: any }} config
 * @returns
 */
async function createViteServer(config) {
	const vite = await import("vite");
	return vite.createServer(config);
}

const devPlugin = {
	browser: () => [css()],
	node: () => [],
};

async function createViteSSREventHandler(router, serveConfig) {
	const viteDevServer = await createViteServer({
		base: router.prefix,
		appType: "custom",
		plugins: [
			devEntries(),
			manifest(),
			devPlugin[router.bundler.target]?.(),
			...(router.bundler?.plugins?.() || []),
		],
		router,

		server: {
			middlewareMode: true,
			hmr: {
				port: serveConfig.ws.port + router.index,
			},
		},
	});

	router.devServer = viteDevServer;

	if (router.mode === "node-handler") {
		return defineEventHandler(async (event) => {
			const { default: handler } = await viteDevServer.ssrLoadModule(
				"./app/server.tsx",
			);
			return handler(event);
		});
	} else {
		return defineEventHandler(fromNodeMiddleware(viteDevServer.middlewares));
	}
}

async function createDevRouterHandler(router, serveConfig) {
	return {
		router: router.prefix,
		handler: await createViteSSREventHandler(router, serveConfig),
	};
}

export async function createDevServer(
	app,
	{ port = 3000, dev = false, ws: { port: wsPort = 16000 } = {} },
) {
	const serveConfig = {
		port,
		dev,
		ws: {
			port: wsPort,
		},
	};

	if (dev) {
		const manifest = createDevManifest(app);
		globalThis.MANIFEST = manifest;
		const nitro = await createNitro({
			rootDir: "",
			dev: true,
			preset: "nitro-dev",
			publicAssets: app.config.routers
				.filter((router) => router.mode === "static")
				.map((router) => ({
					dir: router.dir,
					baseURL: router.prefix,
					passthrough: true,
				})),
			devHandlers: [
				...(await Promise.all(
					app.config.routers
						.filter((router) => router.mode != "static")
						.map((router) => createDevRouterHandler(router, serveConfig)),
				)),
			],
		});
		const devServer = createDevNitroServer(nitro);
		await devServer.listen(port);
	}
}
