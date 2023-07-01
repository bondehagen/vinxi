import { join } from "pathe";

import { resolveConfig } from "./router/node-handler.js";

export function createApp({ routers, bundlers }) {
	const config = {
		bundlers,
		routers,
		root: process.cwd(),
	};

	config.bundlers = bundlers.map((bundler) => {
		let outDir = bundler.outDir ? join(config.root, bundler.outDir) : undefined;
		return {
			target: "static",
			root: config.root,
			...bundler,
			outDir,
		};
	});

	config.routers = routers.map((router, index) => {
		return {
			...resolveConfig(router, config),
			bundler: bundlers.find((bundler) => bundler.name === router.build),
			index,
		};
	});

	globalThis.MANIFEST = new Proxy(
		{},
		{
			get(target, prop) {
				throw new Error("Manifest not yet ready");
			},
		},
	);

	return {
		config,
		getRouter(name) {
			return config.routers.find((router) => router.name === name);
		},
	};
}
