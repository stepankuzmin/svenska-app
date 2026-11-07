import { describe, expect, it } from "vitest";
import { releaseVelocity, rubberband, springStep } from "../src/gesture-motion.ts";

describe("gesture motion", () => {
  it("gives way less the further a pull goes", () => {
    expect(rubberband(100, 800)).toBeCloseTo(51.5, 1);
    expect(rubberband(400, 800)).toBeCloseTo(172.5, 1);
    expect(rubberband(-100, 800)).toBeCloseTo(-51.5, 1);
  });

  it("reads the speed of the last 100 ms of a gesture", () => {
    const samples = [{ position: 0, t: 400 }, { position: 10, t: 450 }, { position: 20, t: 500 }];
    expect(releaseVelocity(samples, 500)).toBe(200);
    expect(releaseVelocity([], 500)).toBe(0);
  });

  it("starts a still spring slowly and carries a moving one on", () => {
    const still = springStep(100, 0, 0.016);
    expect(still.offset).toBeCloseTo(96.6, 1);
    expect(springStep(100, -1000, 0.016).offset).toBeLessThan(still.offset - 10);
  });

  it("comes to rest without passing the target from a standstill", () => {
    let spring = { offset: 100, velocity: 0 };
    for (let frame = 0; frame < 120; frame++) {
      spring = springStep(spring.offset, spring.velocity, 1 / 60);
      expect(spring.offset).toBeGreaterThanOrEqual(0);
    }
    expect(spring.offset).toBeCloseTo(0, 1);
  });
});
