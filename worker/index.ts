import { readOperations, readWords } from "../src/sync/model";
import { LookupLibrary, type DeviceCredential } from "./library";
export { LookupLibrary };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const expectedErrorPattern = /^(4\d\d):(.+)$/;
const secretPattern = /^[0-9a-f]{64}$/;

function secret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function cookieName(request: Request): string {
  return new URL(request.url).protocol === "https:" ? "__Host-svenska-sync" : "svenska-sync";
}
function cookie(request: Request, value: string, clear = false): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 31_536_000}${secure}`;
}
function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private", ...headers } });
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new Error("415:Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("400:Missing request body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("413:Request is too large."); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("400:Invalid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("400:Invalid request.");
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("400:Invalid library or device identity.");
  return value;
}
function tokenOf(value: unknown): string {
  if (typeof value !== "string" || !secretPattern.test(value)) throw new Error("400:Invalid connection token.");
  return value;
}
async function credentialOf(body: Record<string, unknown>, token: string): Promise<DeviceCredential> {
  if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 80 ||
    !Number.isSafeInteger(body.sequence) || (body.sequence as number) < 0) throw new Error("400:Invalid device details.");
  return { id: identifier(body.deviceId), label: body.label.trim(), hash: await digest(token), sequence: body.sequence as number };
}
async function sessionOf(request: Request, env: Env) {
  const name = cookieName(request);
  const value = request.headers.get("Cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) throw new Error("401:Connect this device to sync.");
  const [libraryId, deviceId, token] = value.split(".");
  const stub = env.LIBRARIES.getByName(identifier(libraryId));
  return { stub, libraryId, deviceId: identifier(deviceId), hash: await digest(tokenOf(token)) };
}

async function connect(request: Request, env: Env, path: string): Promise<Response> {
  const body = await bodyOf(request);
  const words = readWords(body.words);
  const token = secret();
  const credential = await credentialOf(body, token);
  const libraryId = path === "libraries" ? crypto.randomUUID() : identifier(body.libraryId);
  const stub = env.LIBRARIES.getByName(libraryId);
  const recoveryToken = secret();
  const snapshot = path === "libraries"
    ? await stub.initialize(credential, words, await digest(recoveryToken))
    : await stub.join(credential, await digest(tokenOf(body.token)), words, path === "recover");
  return json({
    snapshot,
    recoveryCode: path === "libraries" ? `${libraryId}.${recoveryToken}` : undefined,
  }, 200, { "Set-Cookie": cookie(request, `${libraryId}.${credential.id}.${token}`) });
}

async function authenticated(request: Request, env: Env, path: string): Promise<Response> {
  const { stub, libraryId, deviceId, hash } = await sessionOf(request, env);
  if (request.method === "GET" && path === "library") return json(await stub.read(deviceId, hash));
  if (request.method === "GET" && path === "revision") return json(await stub.revision(deviceId, hash));
  if (request.method === "GET" && path === "devices") return json(await stub.devices(deviceId, hash));
  if (request.method === "GET" && path === "events" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    return stub.fetch(new Request("https://library/events", { headers: { Upgrade: "websocket", "X-Sync-Device": deviceId, "X-Sync-Hash": hash } }));
  }
  if (request.method === "DELETE" && path.startsWith("devices/")) {
    await stub.revoke(deviceId, hash, identifier(path.slice(8)));
    return json({ ok: true });
  }
  if (request.method !== "POST") return json({ error: "Unknown sync endpoint." }, 404);
  const body = await bodyOf(request);
  if (path === "operations") return json(await stub.apply(deviceId, hash, readOperations(body.operations)));
  if (path === "invitations") {
    const token = secret();
    const invitation = await stub.invite(deviceId, hash, await digest(token));
    return json({ libraryId, token, ...invitation });
  }
  if (path === "recovery-code") {
    const token = secret();
    await stub.recovery(deviceId, hash, await digest(token));
    return json({ recoveryCode: `${libraryId}.${token}` });
  }
  if (path === "disconnect") {
    await stub.revoke(deviceId, hash, deviceId);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", true) });
  }
  return json({ error: "Unknown sync endpoint." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/sync/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/sync/health" && request.method === "GET") return json({ ok: true });
    try {
      const mutation = !["GET", "HEAD"].includes(request.method);
      const websocket = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
      if ((mutation || websocket) && request.headers.get("Origin") !== url.origin) throw new Error("403:Only this app can connect devices.");
      const path = url.pathname.slice("/api/sync/".length);
      if (mutation) {
        const limit = await env.SYNC_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
        if (!limit.success) return json({ error: "Please wait a minute before trying again." }, 429, { "Retry-After": "60" });
      }
      if (request.method === "POST" && ["libraries", "join", "recover"].includes(path)) return await connect(request, env, path);
      return await authenticated(request, env, path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const expected = expectedErrorPattern.exec(message);
      if (expected) return json({ error: expected[2] }, Number(expected[1]));
      console.error(JSON.stringify({ event: "sync-request-failed", path: url.pathname, error: error instanceof Error ? error.name : "unknown" }));
      return json({ error: "Sync is temporarily unavailable. Your local words are kept." }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
