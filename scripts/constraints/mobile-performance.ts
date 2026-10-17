import { chromium, devices, expect } from "@playwright/test";
import { resolve } from "node:path";
import { preview } from "vite";

const dictionaryPattern = /lexin-dictionary\.[^/]+\.json$/;
const baseDir = process.argv[2];
if (!baseDir) throw new Error("usage: mobile-performance.ts <base checkout>");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });

async function measure(directory: string) {
  const server = await preview({
    configFile: false, logLevel: "silent", root: resolve(directory),
    preview: { host: "127.0.0.1", port: 0, open: false },
  });
  try {
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error("Preview server has no local URL");
    const cold: number[] = [];
    const offline: number[] = [];
    for (let sample = 0; sample < 3; sample++) {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(120_000);
        page.setDefaultNavigationTimeout(120_000);
        const session = await context.newCDPSession(page);
        await session.send("Network.enable");
        await session.send("Network.emulateNetworkConditions", {
          offline: false, latency: 150, downloadThroughput: 200_000,
          uploadThroughput: 93_750, connectionType: "cellular4g",
        });
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const dictionaryResponse = page.waitForResponse((response) => dictionaryPattern.test(response.url()));
        await page.goto(`${url}?q=val`, { waitUntil: "domcontentloaded" });
        const dictionary = await dictionaryResponse;
        if (dictionary.headers()["content-encoding"] !== "gzip") throw new Error("Preview dictionary must use gzip");
        await expect(page.locator(".word-card-list > li")).toHaveCount(2);
        await expect(page.locator(".word-card-list > li").last()).toBeVisible();
        cold.push(await page.evaluate(() => performance.now()));
        await page.waitForFunction(async () => {
          await navigator.serviceWorker.ready;
          return navigator.serviceWorker.controller !== null;
        });
        await context.setOffline(true);
        await page.goto(`${url}?q=bok`, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".word-card-list > li")).toHaveCount(4);
        await expect(page.locator(".word-card-list > li").last()).toBeVisible();
        offline.push(await page.evaluate(() => performance.now()));
      } finally {
        await context.close();
      }
    }
    const median = (values: number[]) => values.sort((a, b) => a - b)[1];
    return { cold: median(cold), offline: median(offline), samples: { cold, offline } };
  } finally {
    await server.close();
  }
}

try {
  const current = await measure(".");
  const base = await measure(baseDir);
  console.log(JSON.stringify({
    cold: { current: current.cold, base: base.cold },
    offline: { current: current.offline, base: base.offline },
    samples: { current: current.samples, base: base.samples },
  }, null, 2));
} finally {
  await browser.close();
}
