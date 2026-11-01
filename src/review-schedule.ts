const minute = 60_000;
const hour = 60 * minute;
const learningSteps = [minute, 10 * minute];
const relearningSteps = [10 * minute];
const startingEase = 2.5;
const minimumEase = 1.3;
const lapseEasePenalty = 0.2;
const maximumInterval = 36_500;
export const newCardsPerDay = 20;
export const reviewsPerDay = 20;
const dayStartHour = 4;

export type Schedule = {
  phase: "learning" | "review" | "relearning";
  step: number;
  interval: number;
  ease: number;
  due: number;
  introduced: number;
  remembered: number;
  forgot: number;
};

export type DayTally = { remembered: number; forgot: number; reviewed: number };

const noAnswers: DayTally = { remembered: 0, forgot: 0, reviewed: 0 };

function count(tally: DayTally, remembered: boolean, reviewed: boolean, by: 1 | -1): DayTally {
  return {
    remembered: tally.remembered + (remembered ? by : 0),
    forgot: tally.forgot + (remembered ? 0 : by),
    reviewed: tally.reviewed + (reviewed ? by : 0),
  };
}

export type ReviewState = {
  schedules: Readonly<Record<string, Schedule>>;
  days: Readonly<Record<string, DayTally>>;
};

export type ReviewCounts = { new: number; learning: number; review: number };

const storageKey = "svenska.review";

export const emptyReviewState: ReviewState = { schedules: {}, days: {} };

export function readReviewState(): ReviewState {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ReviewState> | null;
    return typeof stored?.schedules === "object" && typeof stored.days === "object"
      ? { schedules: stored.schedules, days: stored.days }
      : emptyReviewState;
  } catch {
    return emptyReviewState;
  }
}

export function writeReviewState(state: ReviewState) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Reviews still run when browser storage is unavailable.
  }
}

export function dayStart(now: number, days = 0): number {
  const day = new Date(now - dayStartHour * hour);
  day.setHours(dayStartHour, 0, 0, 0);
  day.setDate(day.getDate() + days);
  return day.getTime();
}

export function dayKey(now: number): string {
  const day = new Date(dayStart(now));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function graduate(schedule: Schedule, interval: number, now: number): Schedule {
  const days = Math.min(maximumInterval, interval);
  return { ...schedule, phase: "review", step: 0, interval: days, due: dayStart(now, days) };
}

export function schedule(current: Schedule | undefined, remembered: boolean, now: number): Schedule {
  const card = current ?? {
    phase: "learning", step: 0, interval: 0, ease: startingEase, due: now, introduced: now, remembered: 0, forgot: 0,
  };
  const tallied = remembered ? { ...card, remembered: card.remembered + 1 } : { ...card, forgot: card.forgot + 1 };

  if (tallied.phase === "review") {
    if (!remembered) {
      return {
        ...tallied,
        phase: "relearning",
        step: 0,
        interval: 1,
        ease: Math.max(minimumEase, tallied.ease - lapseEasePenalty),
        due: now + relearningSteps[0],
      };
    }
    const daysLate = Math.max(0, Math.round((dayStart(now) - tallied.due) / (24 * hour)));
    return graduate(tallied, Math.max(tallied.interval + 1, Math.round((tallied.interval + daysLate / 2) * tallied.ease)), now);
  }

  const steps = tallied.phase === "learning" ? learningSteps : relearningSteps;
  if (!remembered) {
    return { ...tallied, step: 0, due: now + steps[0] };
  }
  const step = tallied.step + 1;
  if (step < steps.length) {
    return { ...tallied, step, due: now + steps[step] };
  }
  return graduate(tallied, tallied.phase === "learning" ? 1 : tallied.interval, now);
}

export function answer(state: ReviewState, card: string, remembered: boolean, now: number): ReviewState {
  const day = dayKey(now);
  const previous = state.schedules[card];
  return {
    schedules: { ...state.schedules, [card]: schedule(previous, remembered, now) },
    days: { ...state.days, [day]: count(state.days[day] ?? noAnswers, remembered, previous?.phase === "review", 1) },
  };
}

export type Answered = { card: string; previous: Schedule | undefined; day: string; remembered: boolean };

export function undoAnswer(state: ReviewState, { card, previous, day, remembered }: Answered): ReviewState {
  const schedules = Object.fromEntries(Object.entries(state.schedules).filter(([key]) => key !== card));
  return {
    schedules: previous === undefined ? schedules : { ...schedules, [card]: previous },
    days: { ...state.days, [day]: count(state.days[day] ?? noAnswers, remembered, previous?.phase === "review", -1) },
  };
}

export function reviewQueue(state: ReviewState, cards: readonly string[], now: number): { next: string | null; counts: ReviewCounts } {
  const learning: string[] = [];
  const review: string[] = [];
  const unseen: string[] = [];
  const today = dayStart(now);
  let introducedToday = 0;
  for (const card of cards) {
    const scheduled = state.schedules[card];
    if (scheduled === undefined) unseen.push(card);
    else {
      if (scheduled.introduced >= today) introducedToday++;
      if (scheduled.phase === "review") {
        if (scheduled.due <= now) review.push(card);
      } else learning.push(card);
    }
  }
  const due = (card: string) => state.schedules[card].due;
  learning.sort((left, right) => due(left) - due(right));
  review.sort((left, right) => due(left) - due(right));
  const fresh = unseen.reverse().slice(0, Math.max(0, newCardsPerDay - introducedToday));
  const learningNow = learning.filter((card) => due(card) <= now);
  const reviews = review.slice(0, Math.max(0, reviewsPerDay - (state.days[dayKey(now)]?.reviewed ?? 0)));
  const next = learningNow[0] ?? reviews[0] ?? fresh[0] ?? learning[0] ?? null;
  return { next, counts: { new: fresh.length, learning: learning.length, review: reviews.length } };
}

export function waitLabel(scheduled: Schedule, now: number): string {
  if (scheduled.phase !== "review") return `${Math.max(1, Math.round((scheduled.due - now) / minute))} min`;
  const days = scheduled.interval;
  if (days < 30) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${Math.round(days / 365)} y`;
}
