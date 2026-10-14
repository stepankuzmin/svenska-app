import { DurableObject } from "cloudflare:workers";
import { applyOperation, maximumWords, recordsOf, type LibrarySnapshot, type SyncOperation, type WordRecord } from "../src/sync/model";
import { wordKey, type LibraryWord } from "../src/words";

type Device = { id: string; label: string; hash: string; acknowledged: number; createdAt: number };
type Invitation = { hash: string; expiresAt: number };
type StoredLibrary = {
  revision: number;
  records: WordRecord[];
  devices: Device[];
  invitations: Invitation[];
  recoveryHash: string;
};
export type DeviceCredential = { id: string; label: string; hash: string; sequence: number };

function sameHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export class LookupLibrary extends DurableObject<Env> {
  private savedRecords = new Map<string, WordRecord>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS library_state (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)");
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS library_records (key TEXT PRIMARY KEY, data TEXT NOT NULL)");
    const legacy = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM library_state WHERE id = 1").toArray()[0];
    if (legacy) {
      const state = JSON.parse(legacy.data) as StoredLibrary;
      if (Array.isArray(state.records)) this.save(state);
    }
  }

  private metadata(): Omit<StoredLibrary, "records"> {
    const rows = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM library_state WHERE id = 1").toArray();
    if (rows.length === 0) throw new Error("404:This library does not exist.");
    return JSON.parse(rows[0].data) as Omit<StoredLibrary, "records">;
  }
  private load(): StoredLibrary {
    const metadata = this.metadata();
    const records = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM library_records").toArray()
      .map((row) => JSON.parse(row.data) as WordRecord);
    this.savedRecords = new Map(records.map((record) => [wordKey(record), record]));
    return { ...metadata, records };
  }
  private save(state: StoredLibrary): void {
    this.ctx.storage.transactionSync(() => {
      for (const record of state.records) {
        const key = wordKey(record);
        if (this.savedRecords.get(key) !== record) {
          this.ctx.storage.sql.exec("INSERT OR REPLACE INTO library_records (key, data) VALUES (?, ?)", key, JSON.stringify(record));
        }
      }
      this.ctx.storage.sql.exec("INSERT OR REPLACE INTO library_state (id, data) VALUES (1, ?)", JSON.stringify({ ...state, records: undefined }));
    });
    this.savedRecords = new Map(state.records.map((record) => [wordKey(record), record]));
  }
  private device(state: Pick<StoredLibrary, "devices">, id: string, hash: string): Device {
    const device = state.devices.find((item) => item.id === id && sameHash(item.hash, hash));
    if (!device) throw new Error("401:This device is no longer connected.");
    return device;
  }
  private snapshot(state: StoredLibrary, device: Device): LibrarySnapshot {
    return {
      protocol: 1, libraryId: this.ctx.id.name ?? "", deviceId: device.id,
      revision: state.revision, acknowledged: device.acknowledged, records: state.records,
    };
  }
  private changed(): void {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send("changed"); } catch { socket.close(1011, "Reconnect to sync."); }
    }
  }

  initialize(credential: DeviceCredential, words: LibraryWord[], recoveryHash: string): LibrarySnapshot {
    if (this.ctx.storage.sql.exec("SELECT id FROM library_state").toArray().length > 0) throw new Error("409:Library already exists.");
    const device: Device = {
      id: credential.id, label: credential.label, hash: credential.hash,
      acknowledged: credential.sequence, createdAt: Date.now(),
    };
    const state: StoredLibrary = { revision: 1, records: recordsOf(words), devices: [device], invitations: [], recoveryHash };
    this.save(state);
    return this.snapshot(state, device);
  }

  read(id: string, hash: string): LibrarySnapshot {
    const state = this.load();
    return this.snapshot(state, this.device(state, id, hash));
  }
  revision(id: string, hash: string): Pick<LibrarySnapshot, "protocol" | "revision" | "acknowledged"> {
    const state = this.metadata();
    const device = this.device(state, id, hash);
    return { protocol: 1, revision: state.revision, acknowledged: device.acknowledged };
  }

  apply(id: string, hash: string, operations: SyncOperation[]): LibrarySnapshot {
    const result = this.ctx.storage.transactionSync(() => {
      const state = this.load();
      const device = this.device(state, id, hash);
      for (const operation of operations) {
        if (operation.sequence <= device.acknowledged) continue;
        if (operation.sequence !== device.acknowledged + 1) throw new Error("409:Sync operations arrived out of order.");
        if (operation.baseRevision > state.revision) throw new Error("409:Invalid library revision.");
        state.revision++;
        state.records = applyOperation(state.records, operation, id, state.revision);
        if (state.records.length > maximumWords) throw new Error("422:This library is full.");
        device.acknowledged = operation.sequence;
      }
      this.save(state);
      return this.snapshot(state, device);
    });
    this.changed();
    return result;
  }

  invite(id: string, hash: string, invitationHash: string): { expiresAt: number } {
    const state = this.load();
    this.device(state, id, hash);
    const expiresAt = Date.now() + 10 * 60_000;
    state.invitations = state.invitations.filter((item) => item.expiresAt > Date.now()).slice(-4);
    state.invitations.push({ hash: invitationHash, expiresAt });
    this.save(state);
    return { expiresAt };
  }

  join(credential: DeviceCredential, invitationHash: string, words: LibraryWord[], recovery: boolean): LibrarySnapshot {
    const result = this.ctx.storage.transactionSync(() => {
      const state = this.load();
      if (recovery) {
        if (!sameHash(state.recoveryHash, invitationHash)) throw new Error("403:Invalid recovery code.");
      } else {
        const invitation = state.invitations.find((item) => item.expiresAt > Date.now() && sameHash(item.hash, invitationHash));
        if (!invitation) throw new Error("410:This pairing link has expired or was already used.");
        state.invitations = state.invitations.filter((item) => item !== invitation);
      }
      const previous = state.devices.find((device) => device.id === credential.id);
      if (!previous && state.devices.length >= 20) throw new Error("422:Disconnect an old device before adding another.");
      const device: Device = {
        id: credential.id, label: credential.label, hash: credential.hash,
        acknowledged: previous?.acknowledged ?? credential.sequence, createdAt: previous?.createdAt ?? Date.now(),
      };
      state.devices = [...state.devices.filter((item) => item.id !== device.id), device];
      if (words.length > 0) {
        state.revision++;
        state.records = applyOperation(state.records, {
          sequence: credential.sequence, baseRevision: state.revision, kind: "import", words,
        }, device.id, state.revision);
      }
      if (state.records.length > maximumWords) throw new Error("422:This library is full.");
      this.save(state);
      return this.snapshot(state, device);
    });
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { deviceId: string; hash: string };
      if (attachment.deviceId === credential.id && !sameHash(attachment.hash, credential.hash)) socket.close(4001, "Device reconnected.");
    }
    this.changed();
    return result;
  }

  devices(id: string, hash: string): { id: string; label: string; current: boolean }[] {
    const state = this.load();
    this.device(state, id, hash);
    return state.devices.map((device) => ({ id: device.id, label: device.label, current: device.id === id }));
  }
  revoke(id: string, hash: string, target: string): void {
    const state = this.load();
    this.device(state, id, hash);
    state.devices = state.devices.filter((device) => device.id !== target);
    this.save(state);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { deviceId: string };
      if (attachment.deviceId === target) socket.close(4001, "Device disconnected.");
    }
    this.changed();
  }
  recovery(id: string, hash: string, nextHash: string): void {
    const state = this.load();
    this.device(state, id, hash);
    state.recoveryHash = nextHash;
    this.save(state);
  }

  fetch(request: Request): Response {
    const id = request.headers.get("X-Sync-Device") ?? "";
    const hash = request.headers.get("X-Sync-Hash") ?? "";
    const state = this.load();
    this.device(state, id, hash);
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ deviceId: id, hash });
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send("changed");
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as { deviceId: string; hash: string };
    try { this.device(this.load(), attachment.deviceId, attachment.hash); socket.send("changed"); }
    catch { socket.close(4001, "Device disconnected."); }
  }
  webSocketError(socket: WebSocket): void { socket.close(1011, "Reconnect to sync."); }
}
