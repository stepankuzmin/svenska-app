import transportUrl from "./transport-url";

let attempt = 0;
type Transport = typeof import("./remote");
let loaded: Promise<Transport> | null = null;
export function loadTransport(): Promise<Transport> {
  return loaded ??= (async () => {
    const url = new URL(transportUrl, location.href);
    if (attempt > 0) url.searchParams.set("retry", String(attempt));
    attempt++;
    const transport = await import(/* @vite-ignore */ url.href) as Transport;
    if (typeof transport.createRemote !== "function" || typeof transport.syncRequest !== "function") throw new Error("Invalid sync module.");
    return transport;
  })().catch((error) => { loaded = null; throw error; });
}
