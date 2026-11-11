import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answer, dayStart, dayKey, emptyReviewState, newCardsPerDay, readReviewState, reviewsPerDay, reviewQueue, schedule, undoAnswer, waitLabel, writeReviewState,
  type ReviewState,
} from "../src/review-schedule.ts";

const minute = 60_000;
const tenAm = new Date(2026, 10, 2, 10).getTime();

function answers(card: string, remembered: readonly boolean[], start = tenAm) {
  let state: ReviewState = emptyReviewState;
  let now = start;
  for (const result of remembered) {
    state = answer(state, card, result, now);
    now = Math.max(now + minute, state.schedules[card].due);
  }
  return state;
}

describe("the review schedule", () => {
  it("starts each day at 4 a.m. local time on the nights the clocks change", () => {
    vi.stubEnv("TZ", "Europe/Stockholm");
    try {
      const springForward = Date.UTC(2026, 2, 29, 2, 30);
      const fallBack = Date.UTC(2026, 9, 25, 2, 30);
      expect(new Date(springForward).getHours()).toBe(4);
      expect(dayKey(springForward)).toBe("2026-03-29");
      expect(new Date(fallBack).getHours()).toBe(3);
      expect(dayKey(fallBack)).toBe("2026-10-24");
      expect(new Date(dayStart(fallBack, 1)).toString()).toContain("Oct 25 2026 04:00");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("walks a new card through the 1 and 10 minute steps before it graduates to one day", () => {
    const first = schedule(undefined, true, tenAm);
    expect(first).toMatchObject({ phase: "learning", step: 1, due: tenAm + 10 * minute });
    const graduated = schedule(first, true, tenAm + 10 * minute);
    expect(graduated).toMatchObject({ phase: "review", interval: 1, ease: 2.5, due: dayStart(tenAm, 1) });
  });

  it("sends a forgotten learning card back to the first step", () => {
    const first = schedule(undefined, true, tenAm);
    expect(schedule(first, false, tenAm)).toMatchObject({ phase: "learning", step: 0, due: tenAm + minute });
  });

  it("multiplies the interval by the ease on each remembered review", () => {
    expect(answers("val", [true, true, true]).schedules.val).toMatchObject({ phase: "review", interval: 3, remembered: 3 });
    expect(answers("val", [true, true, true, true]).schedules.val).toMatchObject({ phase: "review", interval: 8, forgot: 0 });
  });

  it("drops the ease and relearns a forgotten review card, then resumes at one day", () => {
    const lapsed = answers("val", [true, true, true, false]);
    expect(lapsed.schedules.val).toMatchObject({ phase: "relearning", ease: 2.3, interval: 1, forgot: 1 });
    const relearned = schedule(lapsed.schedules.val, true, lapsed.schedules.val.due);
    expect(relearned).toMatchObject({ phase: "review", interval: 1, ease: 2.3 });
  });

  it("credits half the days a review was late", () => {
    const reviewing = { ...schedule(undefined, true, tenAm), phase: "review" as const, interval: 10, due: dayStart(tenAm) };
    expect(schedule(reviewing, true, dayStart(tenAm, 4) + minute).interval).toBe(30);
  });

  it("tallies each review day", () => {
    let state = answer(emptyReviewState, "val", true, tenAm);
    state = answer(state, "hus", false, tenAm);
    state = answer(state, "val", true, dayStart(tenAm, 1) + minute);
    expect(state.days).toEqual({
      "2026-11-02": { remembered: 1, forgot: 1, reviewed: 0 },
      "2026-11-03": { remembered: 1, forgot: 0, reviewed: 0 },
    });
  });

  it("undoes one answer and keeps the answers given since", () => {
    const first = answer(emptyReviewState, "val", true, tenAm);
    const both = answer(first, "hus", false, tenAm);
    const undone = undoAnswer(both, { card: "val", previous: undefined, day: dayKey(tenAm), remembered: true });
    expect(undone).toEqual(answer(emptyReviewState, "hus", false, tenAm));
    const again = answer(first, "val", false, tenAm);
    expect(undoAnswer(again, { card: "val", previous: first.schedules.val, day: dayKey(tenAm), remembered: false })).toEqual(first);
  });

  it("counts an answer after midnight toward the day that started at 4 a.m.", () => {
    const lateNight = new Date(2026, 10, 3, 2).getTime();
    expect(Object.keys(answer(emptyReviewState, "val", true, lateNight).days)).toEqual(["2026-11-02"]);
  });

  it("labels a wait in minutes while learning and in days once reviewing", () => {
    expect(waitLabel(schedule(undefined, false, tenAm), tenAm)).toBe("1 min");
    expect(waitLabel({ ...schedule(undefined, true, tenAm), phase: "review", interval: 4 }, tenAm)).toBe("4 d");
    expect(waitLabel({ ...schedule(undefined, true, tenAm), phase: "review", interval: 60 }, tenAm)).toBe("2 mo");
    expect(waitLabel({ ...schedule(undefined, true, tenAm), phase: "review", interval: 730 }, tenAm)).toBe("2 y");
  });
});

describe("the review queue", () => {
  it("shows due learning cards, then due reviews, then new cards in the order given", () => {
    let state = answer(emptyReviewState, "learning", false, tenAm);
    state = { ...state, schedules: { ...state.schedules, review: { ...state.schedules.learning, phase: "review", interval: 1, due: dayStart(tenAm) } } };
    const cards = ["first", "second", "review", "learning"];
    expect(reviewQueue(state, cards, tenAm + minute)).toEqual({ next: "learning", counts: { new: 2, learning: 1, review: 1 } });
    expect(reviewQueue(state, cards, tenAm).next).toBe("review");
    const reviewed = answer(state, "review", true, tenAm);
    expect(reviewQueue(reviewed, cards, tenAm).next).toBe("first");
  });

  it("shows a learning card early once nothing else is due", () => {
    const state = answer(emptyReviewState, "val", true, tenAm);
    expect(reviewQueue(state, ["val"], tenAm)).toEqual({ next: "val", counts: { new: 0, learning: 1, review: 0 } });
  });

  it("holds back new cards past the daily limit", () => {
    const cards = Array.from({ length: newCardsPerDay + 5 }, (_, index) => `word${index}`);
    let state = emptyReviewState;
    for (const card of cards.slice(0, 3)) state = answer(state, card, true, tenAm);
    expect(reviewQueue(state, cards, tenAm).counts.new).toBe(newCardsPerDay - 3);
    expect(reviewQueue(state, cards, dayStart(tenAm, 1)).counts.new).toBe(newCardsPerDay);
  });

  it("holds back reviews past the daily limit and counts only review answers toward it", () => {
    const cards = Array.from({ length: reviewsPerDay + 5 }, (_, index) => `word${index}`);
    const reviewing = { ...schedule(undefined, true, tenAm), phase: "review" as const, interval: 1, due: dayStart(tenAm) };
    let state: ReviewState = { schedules: Object.fromEntries(cards.map((card) => [card, reviewing])), days: {} };
    expect(reviewQueue(state, cards, tenAm).counts.review).toBe(reviewsPerDay);
    state = answer(state, "word0", false, tenAm);
    state = answer(state, "word0", true, tenAm + 10 * minute);
    expect(state.days[dayKey(tenAm)].reviewed).toBe(1);
    expect(reviewQueue(state, cards, tenAm + 10 * minute).counts.review).toBe(reviewsPerDay - 1);
    expect(reviewQueue(state, cards, dayStart(tenAm, 1)).counts.review).toBe(reviewsPerDay);
  });

  it("finishes when nothing is due", () => {
    const state = answers("val", [true, true]);
    expect(reviewQueue(state, ["val"], tenAm + 11 * minute)).toEqual({ next: null, counts: { new: 0, learning: 0, review: 0 } });
  });
});

describe("the stored review state", () => {
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  afterEach(() => values.clear());

  it("reads back what it wrote", () => {
    const state = answer(emptyReviewState, "val", true, tenAm);
    writeReviewState(state);
    expect(readReviewState()).toEqual(state);
  });

  it("starts empty when nothing or something unreadable is stored", () => {
    expect(readReviewState()).toEqual(emptyReviewState);
    values.set("svenska.review", "{");
    expect(readReviewState()).toEqual(emptyReviewState);
    values.set("svenska.review", "[]");
    expect(readReviewState()).toEqual(emptyReviewState);
  });
});
