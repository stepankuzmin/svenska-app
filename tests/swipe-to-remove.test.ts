import { describe, expect, it } from "vitest";
import { carriesWordOff } from "../src/swipe-to-remove.ts";

describe("a swipe that carries a word off", () => {
  it("carries a word off once the swipe is long enough, at any pace", () => {
    expect(carriesWordOff({ distance: -96, elapsed: 2000 })).toBe(true);
    expect(carriesWordOff({ distance: -300, elapsed: 4000 })).toBe(true);
  });

  it("carries a shorter swipe off when it leaves as a flick", () => {
    expect(carriesWordOff({ distance: -60, elapsed: 80 })).toBe(true);
  });

  // Removing a word cannot be undone, so a pull that reads as deliberate rather
  // than flicked settles back however far it came.
  it("keeps a word a short swipe only pulls at", () => {
    expect(carriesWordOff({ distance: -70, elapsed: 500 })).toBe(false);
    expect(carriesWordOff({ distance: -95, elapsed: 400 })).toBe(false);
    expect(carriesWordOff({ distance: -40, elapsed: 40 })).toBe(false);
  });

  it("keeps a word a swipe carries the other way", () => {
    expect(carriesWordOff({ distance: 300, elapsed: 80 })).toBe(false);
    expect(carriesWordOff({ distance: 0, elapsed: 0 })).toBe(false);
  });
});
