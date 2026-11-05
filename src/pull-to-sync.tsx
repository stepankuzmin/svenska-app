import { useRef } from "react";
import { swipeLockDistance } from "./swipe-to-remove";
import { useSubscription } from "./use-subscription";
import "./pull-to-sync.css";

const commitDistance = 100;
const restDistance = 60;
const shortestSpin = 500;
const spinnerSize = 28;
const tickCount = 12;

function resisted(pull: number): number {
  const size = window.innerHeight;
  return (pull * size * 0.55) / (size + 0.55 * pull);
}

function commitPoint(): number {
  return Math.min(commitDistance, window.innerHeight / 6);
}

export default function PullToSync() {
  const gapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<SVGSVGElement>(null);

  useSubscription(() => {
    const gap = gapRef.current!;
    const spinner = spinnerRef.current!;
    const page = gap.closest<HTMLElement>(".minimal-lookup")!;
    const ticks = [...spinner.children] as SVGElement[];
    let start: { x: number; y: number } | null = null;
    let distance = 0;

    function show(offset: number) {
      page.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
      spinner.style.translate = `0 calc(${(spinnerSize - offset) / 2}px + env(safe-area-inset-top, 0px))`;
    }

    function reveal(progress: number) {
      ticks.forEach((tick, index) => { tick.style.opacity = index < progress * tickCount ? "1" : "0"; });
    }

    function release() {
      start = null;
      delete page.dataset.pulling;
    }

    function begin(event: TouchEvent) {
      const onPanel = event.target instanceof Element && event.target.closest("dialog, [role=listbox]") !== null;
      if (window.visualViewport!.scale > 1 || getComputedStyle(page).transform !== "none" || onPanel || event.touches.length !== 1 || window.scrollY > 0) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      distance = 0;
    }

    function move(event: TouchEvent) {
      if (start === null) return;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const down = event.touches[0].clientY - start.y;
      const across = Math.abs(event.touches[0].clientX - start.x);
      if (down > 0 && event.cancelable) event.preventDefault();
      if (!page.dataset.pulling && across <= swipeLockDistance && down <= swipeLockDistance) return;
      if (across > down) {
        cancel();
        return;
      }
      page.dataset.pulling = "true";
      distance = resisted(Math.max(down - swipeLockDistance, 0));
      show(distance);
      reveal(distance / commitPoint());
    }

    function cancel() {
      if (start === null) return;
      release();
      show(0);
      reveal(0);
    }

    async function end() {
      if (start === null) return;
      if (distance < commitPoint()) {
        cancel();
        return;
      }
      release();
      gap.dataset.syncing = "true";
      ticks.forEach((tick, index) => { tick.style.opacity = String(0.2 + (0.8 * index) / tickCount); });
      show(restDistance);
      await Promise.all([import("./sync/store").then(({ libraryStore }) => libraryStore().refresh()).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, shortestSpin))]);
      delete gap.dataset.syncing;
      show(0);
      reveal(0);
    }

    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel);
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  });

  return (
    <div ref={gapRef} className="pull-to-sync" aria-hidden="true">
      <svg ref={spinnerRef} width={spinnerSize} height={spinnerSize} viewBox="0 0 28 28">
        {Array.from({ length: tickCount }, (_, index) => (
          <rect key={index} x="12.75" y="1" width="2.5" height="7.5" rx="1.25" transform={`rotate(${index * 30} 14 14)`} />
        ))}
      </svg>
    </div>
  );
}
