import transportUrl from "./transport-url";

let attempt = 0;
let loaded: Promise<typeof import("./remote")> | null = null;
async function targetUrl(): Promise<URL> {
  if (transportUrl) return new URL(transportUrl, location.href);
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) throw new Error("Sync code is unavailable.");
  const response = await fetch(`${script.src}.sync.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Sync code is unavailable.");
  const { file } = await response.json() as { file?: unknown };
  if (typeof file !== "string" || !file.startsWith("assets/remote-") || !file.endsWith(".js")) throw new Error("Invalid sync module map.");
  return new URL(file, location.origin);
}
export function loadTransport(): Promise<typeof import("./remote")> {
  return loaded ??= targetUrl().then((url) => {
    if (attempt > 0) url.searchParams.set("retry", String(attempt));
    attempt++;
    return import(/* @vite-ignore */ url.href) as Promise<typeof import("./remote")>;
  }).catch((error) => { loaded = null; throw error; });
}
