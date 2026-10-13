import transportUrl from "./transport-url";

let attempt = 0;
type Transport = typeof import("./remote");
const names = ["createRemote", "queryClient", "syncRequest", "SyncError"] as const;
let loaded: Promise<Transport> | null = null;
async function target(): Promise<{ url: URL; bindings: Record<string, string> }> {
  if (transportUrl) return { url: new URL(transportUrl, location.href), bindings: Object.fromEntries(names.map((name) => [name, name])) };
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) throw new Error("Sync code is unavailable.");
  const response = await fetch(`${script.src}.sync.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Sync code is unavailable.");
  const { file, bindings } = await response.json() as { file?: unknown; bindings?: Record<string, string> };
  if (typeof file !== "string" || !file.startsWith("assets/remote-") || !file.endsWith(".js")) throw new Error("Invalid sync module map.");
  if (!bindings || names.some((name) => typeof bindings[name] !== "string")) throw new Error("Invalid sync module exports.");
  return { url: new URL(file, location.origin), bindings };
}
export function loadTransport(): Promise<Transport> {
  return loaded ??= target().then(async ({ url, bindings }) => {
    if (attempt > 0) url.searchParams.set("retry", String(attempt));
    attempt++;
    const module = await import(/* @vite-ignore */ url.href);
    const transport = Object.fromEntries(names.map((name) => [name, module[bindings[name]]])) as Transport;
    if (typeof transport.createRemote !== "function" || typeof transport.syncRequest !== "function") throw new Error("Invalid sync module.");
    return transport;
  }).catch((error) => { loaded = null; throw error; });
}
