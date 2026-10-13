import transportUrl from "./transport-url";

let attempt = 0;
type Transport = typeof import("./remote");
let loaded: Promise<Transport> | null = null;
async function target(): Promise<URL> {
  if (transportUrl) return new URL(transportUrl, location.href);
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) throw new Error("Sync code is unavailable.");
  const response = await fetch(`${script.src}.sync.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Sync code is unavailable.");
  const { file } = await response.json() as { file?: unknown };
  if (typeof file !== "string" || !file.startsWith("assets/remote-") || !file.endsWith(".js")) throw new Error("Invalid sync module map.");
  return new URL(file, location.origin);
}
export function loadTransport(): Promise<Transport> {
  return loaded ??= target().then(async (url) => {
    if (attempt > 0) url.searchParams.set("retry", String(attempt));
    attempt++;
    const transport = await import(/* @vite-ignore */ url.href) as Transport;
    if (typeof transport.createRemote !== "function" || typeof transport.syncRequest !== "function") throw new Error("Invalid sync module.");
    return transport;
  }).catch((error) => { loaded = null; throw error; });
}
