import { resolve } from "node:path";
import { resolveConfig } from "vite";

// Read each checkout's own Vite config, so a pull request that moves the build output still compares with its base.
export async function assetsDirOf(checkout: string): Promise<string> {
  const root = resolve(checkout);
  const config = await resolveConfig({ root, logLevel: "silent" }, "serve", "production");
  return resolve(root, config.environments.client.build.outDir);
}
