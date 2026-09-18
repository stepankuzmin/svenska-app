// A word leaves the library the way the finger pushed it, and the list closes
// the gap behind it. How far the swipe goes and how fast it leaves decide
// whether the word goes with it.
const removeDistance = 96;
// Removing a word cannot be undone, so a short swipe takes a flick to carry it
// out rather than the gentle pull that dismisses something recoverable.
const flickDistance = 48;
const flickVelocity = 0.35;

// How far a swipe travels sideways before it belongs to the card rather than to
// the library scrolling under it.
export const swipeLockDistance = 8;

export function carriesWordOff({ distance, elapsed }: { distance: number; elapsed: number }): boolean {
  if (distance <= -removeDistance) {
    return true;
  }

  return distance <= -flickDistance && Math.abs(distance) / Math.max(elapsed, 1) > flickVelocity;
}
