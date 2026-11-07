import { useRef } from "react";
import { releaseVelocity, rubberband, springStep } from "./gesture-motion";
import { swipeLockDistance } from "./swipe-to-remove";
import { useSubscription } from "./use-subscription";
import "./pull-to-sync.css";

const commitDistance = 100;
const restDistance = 60;
const shortestRest = 600;
const tickCount = 12;

function commitPoint(): number {
  return Math.min(commitDistance, window.innerHeight / 6);
}

export default function PullToSync() {
  const gapRef = useRef<HTMLDivElement>(null);

  useSubscription(() => {
    const gap = gapRef.current!;
    const page = gap.closest<HTMLElement>(".minimal-lookup")!;
    const ticks = [...gap.querySelectorAll("rect")];
    let start: { x: number; y: number } | null = null;
    let samples: { position: number; t: number }[] = [];
    let grabbed = 0;
    let offset = 0;
    let frame = 0;
    let syncing = false;

    function show(next: number) {
      offset = Math.max(next, 0);
      page.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
    }

    function reveal(progress: number) {
      ticks.forEach((tick, index) => { tick.style.opacity = index < progress * tickCount ? "1" : "0"; });
    }

    function settle(target: number, startVelocity: number, arrive: () => void) {
      cancelAnimationFrame(frame);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        show(target);
        arrive();
        return;
      }
      let velocity = startVelocity;
      let last = performance.now();
      const step = (now: number) => {
        const spring = springStep(offset - target, velocity, Math.max(now - last, 0) / 1000);
        last = now;
        velocity = spring.velocity;
        if (Math.abs(spring.offset) < 0.5 && Math.abs(velocity) < 10) {
          show(target);
          arrive();
          return;
        }
        show(target + spring.offset);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    function release() {
      start = null;
      delete page.dataset.pulling;
    }

    function begin(event: TouchEvent) {
      const onPanel = event.target instanceof Element && event.target.closest("dialog, [role=listbox]") !== null;
      if (window.visualViewport!.scale > 1 || syncing || onPanel || event.touches.length !== 1 || window.scrollY > 0) return;
      cancelAnimationFrame(frame);
      delete gap.dataset.syncing;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      samples = [];
      grabbed = offset;
      reveal(offset / commitPoint());
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
      if (!page.dataset.pulling && across <= swipeLockDistance && Math.abs(down) <= swipeLockDistance) return;
      if (across > down) {
        cancel();
        return;
      }
      page.dataset.pulling = "true";
      const wasPast = offset >= commitPoint();
      show(grabbed + rubberband(Math.max(down - swipeLockDistance, 0), window.innerHeight));
      samples.push({ position: offset, t: event.timeStamp });
      reveal(offset / commitPoint());
      if (!wasPast && offset >= commitPoint()) navigator.vibrate?.(10);
    }

    function slideBack(velocity: number) {
      reveal(0);
      settle(0, velocity, () => { delete gap.dataset.syncing; });
    }

    function cancel() {
      if (start === null) return;
      release();
      slideBack(0);
    }

    function end(event: TouchEvent) {
      if (start === null) return;
      const velocity = releaseVelocity(samples, event.timeStamp);
      const pulled = page.dataset.pulling !== undefined;
      release();
      if (!pulled || offset < commitPoint()) {
        slideBack(velocity);
        return;
      }
      syncing = true;
      gap.dataset.syncing = "true";
      ticks.forEach((tick, index) => { tick.style.opacity = String(0.2 + (0.8 * index) / tickCount); });
      const synced = import("./sync/store").then(({ libraryStore }) => libraryStore().refresh()).catch(() => undefined);
      settle(restDistance, velocity, () => {
        void Promise.all([synced, new Promise((resolve) => setTimeout(resolve, shortestRest))]).then(() => {
          syncing = false;
          slideBack(0);
        });
      });
    }

    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  });

  return (
    <div ref={gapRef} className="pull-to-sync" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <g>
          {Array.from({ length: tickCount }, (_, index) => (
            <rect key={index} x="12.75" y="1" width="2.5" height="7.5" rx="1.25" transform={`rotate(${index * 30} 14 14)`} />
          ))}
        </g>
      </svg>
    </div>
  );
}
