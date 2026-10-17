import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { libraryStore } from "./store";
import type { loadTransport } from "./load-transport";
import "./panel.css";

const mobilePattern = /Mobi/;
type PanelProps = { onClose: () => void; transport: Awaited<ReturnType<typeof loadTransport>> };

type Device = { id: string; label: string; current: boolean };
type Invitation = { libraryId: string; token: string; expiresAt: number };
const statusText = {
  local: "Words are saved on this device.", connecting: "Connecting…", synced: "Your devices are in sync.",
  offline: "Offline. Changes will sync when connected.", saving: "Syncing changes…", error: "Sync needs attention.", revoked: "This device is disconnected.",
};

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
  const [pairing] = useState(pairingFromFragment);
  const [label, setLabel] = useState(mobilePattern.test(navigator.userAgent) ? "Phone" : "Computer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const devices = useQuery({
    queryKey: ["devices", store.state().snapshot.libraryId],
    queryFn: () => syncRequest<Device[]>("devices"), enabled: view.connected && view.status !== "revoked",
  });

  useEffect(() => {
    if (pairing) history.replaceState(null, "", `${location.pathname}${location.search}`);
    dialog.current?.showModal();
  }, []);
  async function act(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function connect(kind: "libraries" | "join" | "recover", details?: { libraryId: string; token: string }): Promise<void> {
    const result = await (await store.startRemote()).connect(kind, { label, ...details });
    if (result.recoveryCode) setRecovery(result.recoveryCode);
    setMessage("Connected. Card changes will sync automatically.");
    await queryClient.invalidateQueries({ queryKey: ["devices"] });
  }
  async function invite(): Promise<void> {
    const invitation = await syncRequest<Invitation>("invitations", {});
    const url = new URL(location.pathname, location.origin);
    url.hash = new URLSearchParams({ pair: `${invitation.libraryId}.${invitation.token}` }).toString();
    setLink(url.href);
    setQr(await QRCode.toDataURL(url.href, { width: 240, margin: 2 }));
  }
  function detailsOf(input: string): { libraryId: string; token: string } {
    const text = input.trim();
    const pair = URL.canParse(text) ? new URLSearchParams(new URL(text).hash.slice(1)).get("pair") ?? "" : text;
    const [libraryId, token] = pair.split(".");
    return { libraryId, token };
  }

  return <dialog className="sync-panel" ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="sync-title">
    <header><h2 id="sync-title">Sync devices</h2><button type="button" onClick={onClose} aria-label="Close sync">Close</button></header>
    <p role="status">{view.error || statusText[view.status]}</p>
    {view.pending > 0 && view.connected ? <p>{view.pending} changes waiting to sync.</p> : null}
    {message && message !== view.error ? <p role="status">{message}</p> : null}
    {pairing && view.connected && store.state().snapshot.libraryId !== pairing.libraryId ? <p>Disconnect this device before joining the library in this link. Your local words will be kept.</p> : null}
    {!view.connected ? <>
      <label>Device name<input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /></label>
      <p>Connect your devices once. Later changes sync automatically.</p>
      {pairing ? <button disabled={busy || !view.readyForSync || !label.trim()} onClick={() => void act(() => connect("join", pairing))}>Connect this device</button>
        : <button disabled={busy || !view.readyForSync || !label.trim()} onClick={() => void act(() => connect("libraries"))}>Enable sync</button>}
      {!pairing ? <>
        <label>Pairing link<input value={joinInput} onChange={(event) => setJoinInput(event.target.value)} autoComplete="off" /></label>
        <button disabled={busy || !view.readyForSync || !joinInput.trim() || !label.trim()} onClick={() => void act(() => connect("join", detailsOf(joinInput)))}>Join another device</button>
      </> : null}
      <details><summary>Recover a library</summary>
        <label>Recovery code<input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} autoComplete="off" /></label>
        <button disabled={busy || !view.readyForSync || !recoveryInput.trim() || !label.trim()} onClick={() => void act(() => connect("recover", detailsOf(recoveryInput)))}>Recover library</button>
      </details>
    </> : <>
      <button disabled={busy || view.status === "revoked"} onClick={() => void act(invite)}>Connect another device</button>
      {link ? <section aria-label="Pairing link">
        <p>Scan this code on your other device. The link works once and expires after 10 minutes.</p>
        <img src={qr} width="240" height="240" alt="QR code to connect another device" />
        <label>Pairing link<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
        <button onClick={() => void act(async () => {
          await navigator.clipboard.writeText(link); setMessage("Pairing link copied.");
        })}>Copy link</button>
        {navigator.share ? <button onClick={() => void act(() => navigator.share({ title: "Connect Svenska.app", url: link }))}>Share link</button> : null}
      </section> : null}
      {devices.data ? <section aria-label="Connected devices"><h3>Connected devices</h3><ul>
        {devices.data.map((device) => <li key={device.id}>{device.label}{device.current ? " (this device)" : ""}
          {!device.current ? <button disabled={busy} onClick={() => void act(async () => {
            await syncRequest(`devices/${device.id}`, undefined, "DELETE"); await devices.refetch();
          })}>Disconnect {device.label}</button> : null}
        </li>)}
      </ul></section> : null}
      {devices.isError ? <p>Could not load connected devices.</p> : null}
      <details><summary>Recovery</summary>
        <p>Keep a recovery code somewhere safe. It can reconnect your library if you clear browser storage. Generating a new code replaces the previous one.</p>
        <button disabled={busy || view.status === "revoked"} onClick={() => void act(async () => {
          const result = await syncRequest<{ recoveryCode: string }>("recovery-code", {}); setRecovery(result.recoveryCode);
        })}>Generate recovery code</button>
      </details>
      <button disabled={busy} onClick={() => void act(async () => {
        if (view.status === "revoked") await store.detach();
        else await (await store.startRemote()).disconnect();
        setLink(""); setQr(""); setRecovery("");
      })}>Disconnect this device</button>
      <p>Disconnecting keeps your words on this device.</p>
    </>}
    {recovery ? <label>Recovery code<input readOnly value={recovery} onFocus={(event) => event.currentTarget.select()} /></label> : null}
  </dialog>;
}
export default function SyncPanel(props: PanelProps) {
  return <QueryClientProvider client={props.transport.queryClient}><Panel {...props} /></QueryClientProvider>;
}
