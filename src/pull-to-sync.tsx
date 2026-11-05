import { useRef } from "react";
import { swipeLockDistance } from "./swipe-to-remove";
import { useSubscription } from "./use-subscription";
import "./pull-to-sync.css";

const commitDistance = 64;
const maximumDistance = 96;
const syncingDistance = 56;
const shortestSpin = 500;

export default function PullToSync() {
  const indicator = useRef<HTMLDivElement>(null);

  useSubscription(() => {
    const element = indicator.current!;
    let start: { x: number; y: number } | null = null;
    let distance = 0;

    function show(offset: number) {
      element.style.opacity = String(Math.min(offset / commitDistance, 1));
      element.style.transform = `translateY(${offset}px) rotate(${offset * 4}deg)`;
    }

    function release() {
      start = null;
      element.style.transition = "";
    }

    function begin(event: TouchEvent) {
      const onPanel = event.target instanceof Element && event.target.closest("dialog, [role=listbox]") !== null;
      if (element.dataset.syncing || onPanel || event.touches.length !== 1 || window.scrollY > 0) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      distance = 0;
    }

    function move(event: TouchEvent) {
      if (start === null) return;
      const down = event.touches[0].clientY - start.y;
      const across = Math.abs(event.touches[0].clientX - start.x);
      if (across <= swipeLockDistance && down <= swipeLockDistance) return;
      if (event.touches.length !== 1 || across > down) {
        cancel();
        return;
      }
      element.style.transition = "none";
      distance = Math.min(down / 2, maximumDistance);
      show(distance);
    }

    function cancel() {
      if (start === null) return;
      release();
      show(0);
    }

    async function end() {
      if (start === null) return;
      if (distance < commitDistance) {
        cancel();
        return;
      }
      release();
      element.dataset.syncing = "true";
      show(syncingDistance);
      await Promise.all([import("./sync/store").then(({ libraryStore }) => libraryStore().refresh()).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, shortestSpin))]);
      delete element.dataset.syncing;
      show(0);
    }

    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel);
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  });

  return <div ref={indicator} className="pull-to-sync" aria-hidden="true" />;
}
