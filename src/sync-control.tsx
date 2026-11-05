import { lazy, Suspense, useReducer } from "react";
import PullToSync from "./pull-to-sync";
import { loadTransport } from "./sync/load-transport";
import { useListener } from "./use-subscription";

const StorageStatus = lazy(() => import("./sync/status").catch(() => ({ default: () => <></> })));
const SyncPanel = lazy(() => Promise.all([import("./sync/panel"), loadTransport()])
  .then(([{ default: Panel }, transport]) => ({
    default: (props: { onClose: () => void }) => <Panel {...props} transport={transport} />,
  }))
  .catch(() => ({ default: () => <span role="status">Connect once and reload to open device sync.</span> })));


const hasPairing = () => new URLSearchParams(location.hash.slice(1)).has("pair");

type Panel = { open: boolean; pairingVersion: number };

function reducePanel(panel: Panel, event: "opened" | "closed" | "paired"): Panel {
  if (event === "paired") return { open: true, pairingVersion: panel.pairingVersion + 1 };
  return { ...panel, open: event === "opened" };
}

export default function SyncControl() {
  const [{ open, pairingVersion }, dispatch] = useReducer(reducePanel, undefined, () => ({ open: hasPairing(), pairingVersion: 0 }));
  useListener(window, "hashchange", () => { if (hasPairing()) dispatch("paired"); });
  return <>
    <button type="button" style={{ font: "inherit", color: "inherit", border: 0, background: "transparent", textDecoration: "underline", marginInlineStart: "1rem", cursor: "pointer", padding: 0 }} onClick={() => dispatch("opened")}>Sync devices</button>
    <PullToSync />
    <Suspense fallback={null}><StorageStatus /></Suspense>
    {open ? <Suspense fallback={<span role="status">Opening sync…</span>}>
      <SyncPanel key={pairingVersion} onClose={() => dispatch("closed")} />
    </Suspense> : null}
  </>;
}
