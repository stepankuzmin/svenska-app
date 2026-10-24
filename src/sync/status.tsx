import { useSyncExternalStore } from "react";
import { libraryStore } from "./store";

export default function StorageStatus() {
  const store = libraryStore();
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return view.status === "error" ? <span role="status"> {view.error}</span> : null;
}
