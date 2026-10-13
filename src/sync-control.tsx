import { lazy, Suspense, useEffect, useState } from "react";

const StorageStatus = lazy(() => import("./sync/status").catch(() => ({ default: () => <></> })));
const SyncPanel = lazy(() => import("./sync/panel").catch(() => ({
  default: () => <span role="status">Connect once and reload to open device sync.</span>,
})));

export default function SyncControl() {
  const [pairingVersion, setPairingVersion] = useState(0);
  const [open, setOpen] = useState(() => new URLSearchParams(location.hash.slice(1)).has("pair"));
  useEffect(() => {
    const showPairing = () => {
      if (new URLSearchParams(location.hash.slice(1)).has("pair")) {
        setPairingVersion((version) => version + 1);
        setOpen(true);
      }
    };
    window.addEventListener("hashchange", showPairing);
    return () => window.removeEventListener("hashchange", showPairing);
  }, []);
  return <>
    <button type="button" style={{ font: "inherit", color: "inherit", border: 0, background: "transparent", textDecoration: "underline", marginInlineStart: "1rem", cursor: "pointer", padding: 0 }} onClick={() => setOpen(true)}>Sync devices</button>
    <Suspense fallback={null}><StorageStatus /></Suspense>
    {open ? <Suspense fallback={<span role="status">Opening sync…</span>}>
      <SyncPanel key={pairingVersion} onClose={() => setOpen(false)} />
    </Suspense> : null}
  </>;
}
