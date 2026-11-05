import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { answer, dayKey, schedule, undoAnswer, waitLabel, type Answered, type ReviewCounts, type ReviewState } from "./review-schedule";
import { releaseVelocity, rubberband, springStep } from "./gesture-motion";
import { swipeLockDistance } from "./swipe-to-remove";
import { useListener } from "./use-subscription";
import type { WordCardContent } from "./word-cards";
import "./review.css";

type Drag = { pointerId: number; startX: number; grabX: number; dragging: boolean; samples: { position: number; t: number }[] };

const commitDistance = 96;
function projected(velocity: number): number {
  return (velocity / 1000) * 0.998 / (1 - 0.998);
}

type Round = { revealedCard: string | null; answered: number; undo: Answered | null; retry: Answered | null };
type RoundEvent = { kind: "revealed"; card: string } | { kind: "graded"; undo: Answered } | { kind: "undone"; undo: Answered };

function reduceRound(round: Round, event: RoundEvent): Round {
  switch (event.kind) {
    case "revealed": return { ...round, revealedCard: event.card };
    case "graded": return { revealedCard: null, answered: round.answered + 1, undo: event.undo, retry: null };
    case "undone": return { revealedCard: event.undo.card, answered: round.answered + 1, undo: null, retry: event.undo };
  }
}

function ReviewCard({
  revealed,
  enterFrom,
  onReveal,
  onGrade,
  children,
}: {
  revealed: boolean;
  enterFrom: number;
  onReveal: () => void;
  onGrade: (remembered: boolean) => void;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const motion = useRef({ x: 0, v: 0, frame: 0 });
  const drag = useRef<Drag | null>(null);

  function show(x: number) {
    const element = surface.current;
    motion.current.x = x;
    if (element === null) return;
    const shown = revealed ? x : rubberband(x, element.offsetWidth);
    element.style.transform = shown === 0 ? "" : `translateX(${shown}px) rotate(${shown / 24}deg)`;
    element.style.setProperty("--drag", String(revealed ? Math.max(-1, Math.min(1, x / commitDistance)) : 0));
  }

  function animate(target: number, velocity: number, leave?: () => void) {
    const element = surface.current;
    cancelAnimationFrame(motion.current.frame);
    if (element === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show(target);
      leave?.();
      return;
    }
    const offscreen = (window.innerWidth + element.offsetWidth) / 2;
    let last = performance.now();
    motion.current.v = velocity;
    const step = (now: number) => {
      const elapsed = Math.max(now - last, 0) / 1000;
      last = now;
      const spring = springStep(motion.current.x - target, motion.current.v, elapsed);
      const next = target + spring.offset;
      motion.current.v = spring.velocity;
      if (leave !== undefined && Math.abs(next) >= offscreen) {
        show(next);
        leave();
      } else if (Math.abs(next - target) < 0.5 && Math.abs(motion.current.v) < 10) {
        show(target);
        leave?.();
      } else {
        show(next);
        motion.current.frame = requestAnimationFrame(step);
      }
    };
    motion.current.frame = requestAnimationFrame(step);
  }

  useLayoutEffect(() => {
    if (enterFrom !== 0) {
      show(enterFrom * window.innerWidth);
      animate(0, 0);
    }
    return () => cancelAnimationFrame(motion.current.frame);
  }, []);

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current !== null || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.pressed = "true";
    cancelAnimationFrame(motion.current.frame);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      grabX: event.clientX - motion.current.x,
      dragging: motion.current.x !== 0,
      samples: [],
    };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    if (!current.dragging && Math.abs(event.clientX - current.startX) <= swipeLockDistance) return;
    current.dragging = true;
    const x = event.clientX - current.grabX;
    current.samples.push({ position: x, t: event.timeStamp });
    show(x);
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    delete event.currentTarget.dataset.pressed;
    if (current === null) return;
    if (!current.dragging) {
      onReveal();
      return;
    }
    const velocity = releaseVelocity(current.samples, event.timeStamp);
    const landing = motion.current.x + projected(velocity);
    if (revealed && Math.abs(landing) > commitDistance) {
      const remembered = landing > 0;
      animate(Math.sign(landing) * window.innerWidth * 2, velocity, () => onGrade(remembered));
    } else {
      animate(0, velocity);
    }
  }

  return (
    <div
      ref={surface}
      className="review-card"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(event) => {
        drag.current = null;
        delete event.currentTarget.dataset.pressed;
        animate(0, 0);
      }}
    >
      {children}
    </div>
  );
}

export default function Review({
  cards,
  state,
  now,
  next,
  counts,
  onChange,
  onClose,
}: {
  cards: readonly WordCardContent[];
  state: ReviewState;
  now: number;
  next: string | null;
  counts: ReviewCounts;
  onChange: (state: ReviewState) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [{ revealedCard, answered, undo, retry }, dispatch] = useReducer(reduceRound, { revealedCard: null, answered: 0, undo: null, retry: null });
  const byKey = useMemo(() => new Map(cards.map((card) => [card.card, card])), [cards]);
  const current = byKey.get(retry?.card ?? next ?? "");
  const revealed = current !== undefined && revealedCard === current.card;

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.focus();
  }, []);

  useListener<KeyboardEvent>(document, "keydown", keyDown);

  function grade(remembered: boolean) {
    if (current === undefined) return;
    const at = Date.now();
    dispatch({ kind: "graded", undo: { card: current.card, previous: state.schedules[current.card], day: dayKey(at), remembered } });
    onChange(answer(state, current.card, remembered, at));
  }

  function reveal() {
    if (current !== undefined) dispatch({ kind: "revealed", card: current.card });
  }

  function undoLast() {
    if (undo === null) return;
    onChange(undoAnswer(state, undo));
    dispatch({ kind: "undone", undo });
    dialog.current?.focus();
  }

  function keyDown(event: KeyboardEvent) {
    dialog.current!.dataset.keyboard = "true";
    if (event.target instanceof HTMLButtonElement && (event.key === "Enter" || event.key === " ")) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();
      undoLast();
    } else if (!revealed && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      reveal();
    } else if (revealed && event.key === "ArrowLeft") grade(false);
    else if (revealed && event.key === "ArrowRight") grade(true);
  }

  const scheduled = current === undefined ? undefined : state.schedules[current.card];

  return (
    <dialog
      ref={dialog}
      className="review"
      aria-label="Review"
      tabIndex={-1}
      onPointerDown={(event) => { delete event.currentTarget.dataset.keyboard; }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="review-header">
        <button type="button" className="review-text-button" onClick={onClose}>Done</button>
        {current === undefined ? null : (
          <p className="review-counts">
            <span><b className="review-count-new">{counts.new}</b> new</span>
            <span><b className="review-count-learning">{counts.learning}</b> learning</span>
            <span><b className="review-count-review">{counts.review}</b> to review</span>
          </p>
        )}
        <button type="button" className="review-text-button" onClick={undoLast} disabled={undo === null}>Undo</button>
      </header>

      {current === undefined ? (
        <ReviewSummary cards={cards} state={state} now={now} />
      ) : (
        <div className="review-deck">
          <ReviewCard key={`${current.card}:${answered}`} revealed={revealed} enterFrom={retry === null || dialog.current?.dataset.keyboard ? 0 : retry.remembered ? 1 : -1} onReveal={reveal} onGrade={grade}>
            <span className="review-stamp review-stamp-remembered" aria-hidden="true">Remembered · {waitLabel(schedule(scheduled, true, now), now)}</span>
            <span className="review-stamp review-stamp-forgot" aria-hidden="true">Forgot · {waitLabel(schedule(scheduled, false, now), now)}</span>
            <p className="review-russian" lang="ru">{current.translation}</p>
            <div className={revealed ? "review-answer is-shown" : "review-answer"} lang="sv">
              <div className="review-answer-body">
                <p className="review-swedish">{current.citation}</p>
                {current.forms.length > 1 ? <p className="review-forms">{current.forms.join(", ")}</p> : null}
              </div>
            </div>
          </ReviewCard>
        </div>
      )}
    </dialog>
  );
}

function ReviewSummary({
  cards,
  state,
  now,
}: {
  cards: readonly WordCardContent[];
  state: ReviewState;
  now: number;
}) {
  const today = state.days[dayKey(now)] ?? { remembered: 0, forgot: 0, reviewed: 0 };
  const tallies = Object.values(state.days);
  const remembered = tallies.reduce((sum, day) => sum + day.remembered, 0);
  const total = remembered + tallies.reduce((sum, day) => sum + day.forgot, 0);
  const forgotten = cards
    .filter((card) => (state.schedules[card.card]?.forgot ?? 0) > 0)
    .sort((left, right) => state.schedules[right.card].forgot - state.schedules[left.card].forgot)
    .slice(0, 5);

  return (
    <section className="review-summary" aria-labelledby="review-summary-heading">
      <h2 id="review-summary-heading">All caught up</h2>
      <dl className="review-stats">
        <div><dt>Remembered today</dt><dd>{today.remembered}</dd></div>
        <div><dt>Forgot today</dt><dd>{today.forgot}</dd></div>
        <div><dt>All reviews</dt><dd>{total}</dd></div>
        <div><dt>Recall rate</dt><dd>{total === 0 ? "–" : `${Math.round((remembered / total) * 100)}%`}</dd></div>
      </dl>
      {forgotten.length > 0 ? (
        <>
          <h3>Most forgotten</h3>
          <ul className="review-forgotten" role="list">
            {forgotten.map((card) => {
              const { forgot, remembered: kept } = state.schedules[card.card];
              return (
                <li key={card.card}>
                  <span><strong lang="sv">{card.citation}</strong> <span lang="ru">{card.translation}</span></span>
                  <span className="review-forgotten-count">{`forgot ${forgot} of ${forgot + kept}`}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
