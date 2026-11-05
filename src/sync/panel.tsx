import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { libraryStore } from "./store";
import type { loadTransport } from "./load-transport";
import { mergeState } from "../use-subscription";
import "./panel.css";

const mobilePattern = /Mobi/;
type PanelProps = { onClose: () => void; transport: Awaited<ReturnType<typeof loadTransport>> };

type PanelState = {
  label: string; busy: boolean; message: string; link: string; qr: string; recovery: string; recoveryInput: string; joinInput: string;
};
type Device = { id: string; label: string; current: boolean };
type Invitation = { libraryId: string; token: string; expiresAt: number };
const statusText = {
  local: "Words are saved on this device.", connecting: "Connecting…", synced: "Your devices are in sync.",
  offline: "Offline. Changes will sync when connected.", saving: "Syncing changes…", error: "Sync needs attention.", revoked: "This device is disconnected.",
};

type Turnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string; appearance: "interaction-only"; callback: (token: string) => void; "error-callback": () => void;
  }) => string;
  remove: (widget: string) => void;
};
let turnstile: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  return turnstile ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    script.onerror = () => {
      turnstile = null; script.remove();
      reject(new Error("Could not load the check that you are a person. Check your connection and try again."));
    };
    document.head.append(script);
  });
}

function pairingFromFragment(): { libraryId: string; token: string } | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const pair = fragment.get("pair");
  if (!pair) return null;
  const [libraryId, token] = pair.split(".");
  return { libraryId, token };
}

function Panel({ onClose, transport }: PanelProps) {
  const { queryClient, syncRequest } = transport;
  const store = libraryStore();
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const challenge = useRef<HTMLDivElement>(null);
  const [pairing] = useState(pairingFromFragment);
  const [{ label, busy, message, link, qr, recovery, recoveryInput, joinInput }, update] = useReducer(mergeState<PanelState>, {
    label: mobilePattern.test(navigator.userAgent) ? "Phone" : "Computer",
    busy: false, message: "", link: "", qr: "", recovery: "", recoveryInput: "", joinInput: "",
  });
  const devices = useQuery({
    queryKey: ["devices", store.state().snapshot.libraryId],
    queryFn: () => syncRequest<Device[]>("devices"), enabled: view.connected && view.status !== "revoked",
  });

  useEffect(() => {
    if (pairing) history.replaceState(null, "", `${location.pathname}${location.search}`);
    dialog.current?.showModal();
  }, []);
  async function act(action: () => Promise<void>): Promise<void> {
    update({ busy: true, message: "" });
    try { await action(); }
    catch (error) { update({ message: error instanceof Error ? error.message : "Please try again." }); }
    finally { update({ busy: false }); }
  }
  async function confirmHuman(): Promise<string> {
    const [{ siteKey }, api] = await Promise.all([syncRequest<{ siteKey: string }>("challenge"), loadTurnstile()]);
    return new Promise((resolve, reject) => {
      const widget = api.render(challenge.current!, {
        sitekey: siteKey, appearance: "interaction-only",
        callback: (token) => { api.remove(widget); resolve(token); },
        "error-callback": () => { api.remove(widget); reject(new Error("The check that you are a person failed. Try again.")); },
      });
    });
  }
  async function connect(kind: "libraries" | "join" | "recover", details?: { libraryId: string; token: string }): Promise<void> {
    const result = await (await store.startRemote()).connect(kind, { label, ...details, challenge: await confirmHuman() });
    if (result.recoveryCode) update({ recovery: result.recoveryCode });
    update({ message: "Connected. Card changes will sync automatically." });
    await queryClient.invalidateQueries({ queryKey: ["devices"] });
  }
  async function invite(): Promise<void> {
    const invitation = await syncRequest<Invitation>("invitations", {});
    const url = new URL(location.pathname, location.origin);
    url.hash = new URLSearchParams({ pair: `${invitation.libraryId}.${invitation.token}` }).toString();
    update({ link: url.href });
    update({ qr: await QRCode.toDataURL(url.href, { width: 240, margin: 2 }) });
  }
  function detailsOf(input: string): { libraryId: string; token: string } {
    const text = input.trim();
    const pair = URL.canParse(text) ? new URLSearchParams(new URL(text).hash.slice(1)).get("pair") ?? "" : text;
    const [libraryId, token] = pair.split(".");
    return { libraryId, token };
  }

  return <dialog className="sync-panel" ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="sync-title">
    <header><h2 id="sync-title">Sync devices</h2><button type="button" className="sync-text-button" onClick={onClose} aria-label="Close sync">Close</button></header>
    <p role="status">{view.error || statusText[view.status]}</p>
    {view.pending > 0 && view.connected ? <p>{view.pending} changes waiting to sync.</p> : null}
    {message && message !== view.error ? <p role="status">{message}</p> : null}
    {pairing && view.connected && store.state().snapshot.libraryId !== pairing.libraryId ? <p>Disconnect this device before joining the library in this link. Your local words will be kept.</p> : null}
    {!view.connected ? <>
      <div ref={challenge} />
      <label>Device name<input value={label} maxLength={80} onChange={(event) => update({ label: event.target.value })} /></label>
      <p>Connect your devices once. Later changes sync automatically.</p>
      {pairing ? <button className="sync-primary" disabled={busy || !view.readyForSync || !label.trim()} onClick={() => void act(() => connect("join", pairing))}>Connect this device</button>
        : <button className="sync-primary" disabled={busy || !view.readyForSync || !label.trim()} onClick={() => void act(() => connect("libraries"))}>Enable sync</button>}
      {!pairing ? <>
        <label>Pairing link<input value={joinInput} onChange={(event) => update({ joinInput: event.target.value })} autoComplete="off" /></label>
        <button disabled={busy || !view.readyForSync || !joinInput.trim() || !label.trim()} onClick={() => void act(() => connect("join", detailsOf(joinInput)))}>Join another device</button>
      </> : null}
      <details><summary>Recover a library</summary>
        <label>Recovery code<input value={recoveryInput} onChange={(event) => update({ recoveryInput: event.target.value })} autoComplete="off" /></label>
        <button disabled={busy || !view.readyForSync || !recoveryInput.trim() || !label.trim()} onClick={() => void act(() => connect("recover", detailsOf(recoveryInput)))}>Recover library</button>
      </details>
    </> : <>
      <button className="sync-primary" disabled={busy || view.status === "revoked"} onClick={() => void act(invite)}>Connect another device</button>
      {link ? <section aria-label="Pairing link">
        <p>Scan this code on your other device. The link works once and expires after 10 minutes.</p>
        <img src={qr} width="240" height="240" alt="QR code to connect another device" />
        <label>Pairing link<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
        <button onClick={() => void act(async () => {
          await navigator.clipboard.writeText(link); update({ message: "Pairing link copied." });
        })}>Copy link</button>
        {navigator.share ? <button onClick={() => void act(() => navigator.share({ title: "Connect Svenska.app", url: link }))}>Share link</button> : null}
      </section> : null}
      {devices.data ? <section aria-label="Connected devices"><h3>Connected devices</h3><ul role="list">
        {devices.data.map((device) => <li key={device.id}><span>{device.label}</span>
          {device.current ? <small>This device</small> : <button className="sync-text-button sync-destructive" aria-label={`Disconnect ${device.label}`} disabled={busy} onClick={() => void act(async () => {
            await syncRequest(`devices/${device.id}`, undefined, "DELETE"); await devices.refetch();
          })}>Disconnect</button>}
        </li>)}
      </ul></section> : null}
      {devices.isError ? <p>Could not load connected devices.</p> : null}
      <details><summary>Recovery</summary>
        <p>Keep a recovery code somewhere safe. It can reconnect your library if you clear browser storage. Generating a new code replaces the previous one.</p>
        <button disabled={busy || view.status === "revoked"} onClick={() => void act(async () => {
          const result = await syncRequest<{ recoveryCode: string }>("recovery-code", {}); update({ recovery: result.recoveryCode });
        })}>Generate recovery code</button>
      </details>
      <button className="sync-destructive" disabled={busy} onClick={() => void act(async () => {
        if (view.status === "revoked") await store.detach();
        else await (await store.startRemote()).disconnect();
        update({ link: "", qr: "", recovery: "" });
      })}>Disconnect this device</button>
      <p className="sync-note">Disconnecting keeps your words on this device.</p>
    </>}
    {recovery ? <label>Recovery code<input readOnly value={recovery} onFocus={(event) => event.currentTarget.select()} /></label> : null}
  </dialog>;
}
export default function SyncPanel(props: PanelProps) {
  return <QueryClientProvider client={props.transport.queryClient}><Panel {...props} /></QueryClientProvider>;
}
