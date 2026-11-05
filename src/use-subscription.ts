import { useEffect, useRef } from "react";

export function mergeState<State>(state: State, patch: Partial<State>): State {
  return { ...state, ...patch };
}

export function useSubscription(subscribe: () => void | (() => void)) {
  useEffect(subscribe, []);
}

export function useListener<E extends Event = Event>(target: EventTarget, type: string, listener: (event: E) => void) {
  const latest = useRef(listener);
  latest.current = listener;
  useSubscription(() => {
    const handle = (event: Event) => latest.current(event as E);
    target.addEventListener(type, handle);
    return () => target.removeEventListener(type, handle);
  });
}
