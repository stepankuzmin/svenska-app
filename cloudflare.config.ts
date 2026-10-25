import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./worker/index.ts" with { type: "cf-worker" };

const previewPattern = /^pr-(\d+)$/;

// cf builds and deploys in "production" mode unless --mode is given.
export default defineConfig(({ mode }) => {
	const production = mode === "production";
	const preview = previewPattern.exec(mode ?? "")?.[1];
	return {
		worker: {
			name: production ? "svenska-app" : preview ? `svenska-app-pr-${preview}` : "svenska-app-local",
			compatibilityDate: "2026-09-16",
			entrypoint,
			workersDev: true,
			previewUrls: production,
			observability: {
				enabled: true,
				traces: {
					enabled: true,
					headSamplingRate: 0.01,
				},
			},
			assets: {
				runWorkerFirst: [
					"/api/sync/*",
				],
			},
			env: {
				TURNSTILE_SITE_KEY: bindings.text(production ? "0x4AAAAAAFjlEi5_IgJshENu" : "1x00000000000000000000AA"),
				// Production keeps the secret set on the Worker.
				TURNSTILE_SECRET: production ? null : bindings.text("1x0000000000000000000000000000000AA"),
				SYNC_LIMIT: bindings.rateLimit({
					namespace: String(1001 + Number(preview ?? 0) * 10_000),
					simple: {
						limit: 120,
						period: 60,
					},
				}),
				ASSETS: bindings.assets(),
			},
			exports: {
				LookupLibrary: exports.durableObject({ storage: "sqlite" }),
			},
		},
	};
});
