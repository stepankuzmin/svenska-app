import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { carriesWordOff, swipeLockDistance } from "./swipe-to-remove";

// The card follows the finger rather than waiting for the release, so the
// gesture reads as direct, and the word leaves the way it was pushed.
type Swipe = {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  dragging: boolean;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSwipeToRemove({ onRemove }: { onRemove: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const swipe = useRef<Swipe | null>(null);
  const dragged = useRef(false);

  function holdAt(distance: number) {
    const element = surface.current;
    if (element === null) {
      return;
    }

    element.dataset.swiping = "true";
    // Left is the way out. A pull to the right meets rising resistance rather
    // than a wall, the way a real thing slows before it stops.
    element.style.transform = `translateX(${distance < 0 ? distance : Math.sqrt(distance) * 4}px)`;
  }

  function settle() {
    const element = surface.current;
    if (element === null) {
      return;
    }

    delete element.dataset.swiping;
    element.style.removeProperty("transform");
  }

  function leave() {
    const element = surface.current;
    if (element === null || prefersReducedMotion()) {
      onRemove();
      return;
    }

    settle();
    element.dataset.leaving = "true";
    const finish = (event: TransitionEvent) => {
      if (event.propertyName !== "transform") {
        return;
      }

      element.removeEventListener("transitionend", finish);
      onRemove();
    };
    element.addEventListener("transitionend", finish);
  }

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    // A second finger mid-swipe would make the card jump.
    if (swipe.current !== null || !event.isPrimary) {
      return;
    }

    dragged.current = false;
    swipe.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      dragging: false,
    };
  }

  function continueSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const current = swipe.current;
    if (current === null || event.pointerId !== current.pointerId) {
      return;
    }

    const distance = event.clientX - current.startX;
    const drift = event.clientY - current.startY;
    if (!current.dragging) {
      // The library scrolls, so a move that reads as vertical stays the page's.
      if (Math.abs(drift) > swipeLockDistance && Math.abs(drift) >= Math.abs(distance)) {
        swipe.current = null;
        return;
      }

      if (Math.abs(distance) <= swipeLockDistance || Math.abs(distance) <= Math.abs(drift)) {
        return;
      }

      current.dragging = true;
      dragged.current = true;
      // The swipe carries on when the finger leaves the card.
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    holdAt(distance);
  }

  function endSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const current = swipe.current;
    swipe.current = null;
    if (current === null || !current.dragging) {
      return;
    }

    if (carriesWordOff({
      distance: event.clientX - current.startX,
      elapsed: event.timeStamp - current.startTime,
    })) {
      leave();
      return;
    }

    settle();
  }

  function cancelSwipe() {
    swipe.current = null;
    settle();
  }

  // A swipe ends in a click the card would otherwise read as a tap on itself.
  function swallowClickAfterSwipe(event: ReactMouseEvent<HTMLDivElement>) {
    if (!dragged.current) {
      return;
    }

    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    remove: leave,
    surfaceProps: {
      ref: surface,
      onPointerDown: beginSwipe,
      onPointerMove: continueSwipe,
      onPointerUp: endSwipe,
      onPointerCancel: cancelSwipe,
      onClickCapture: swallowClickAfterSwipe,
    },
  };
}
