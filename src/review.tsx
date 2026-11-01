import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { answer, dayKey, schedule, undoAnswer, waitLabel, type Answered, type ReviewCounts, type ReviewState } from "./review-schedule";
import { carriesWordOff, swipeLockDistance } from "./swipe-to-remove";
import type { WordCardContent } from "./word-cards";
import "./review.css";

type Drag = { pointerId: number; startX: number; startTime: number; dragging: boolean };

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
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [revealedCard, setRevealedCard] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [undo, setUndo] = useState<Answered | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(cards.map((card) => [card.card, card])), [cards]);
  const current = byKey.get(retry ?? next ?? "");
  const revealed = current !== undefined && revealedCard === current.card;

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.focus();
  }, []);

  const latestKeyDown = useRef(keyDown);
  latestKeyDown.current = keyDown;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => latestKeyDown.current(event);
    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, []);

  function grade(remembered: boolean) {
    if (current === undefined) return;
    const at = Date.now();
    setUndo({ card: current.card, previous: state.schedules[current.card], day: dayKey(at), remembered });
    setRetry(null);
    onChange(answer(state, current.card, remembered, at));
    setRevealedCard(null);
    setAnswered((count) => count + 1);
  }

  function reveal() {
    if (current !== undefined) setRevealedCard(current.card);
  }

  function undoLast() {
    if (undo === null) return;
    onChange(undoAnswer(state, undo));
    setRetry(undo.card);
    setUndo(null);
    setRevealedCard(undo.card);
    setAnswered((count) => count + 1);
  }

  function hold(distance: number) {
    const element = surface.current;
    if (element === null) return;
    const shown = revealed ? distance : Math.sign(distance) * Math.sqrt(Math.abs(distance)) * 3;
    element.dataset.dragging = "true";
    element.style.transform = `translateX(${shown}px) rotate(${shown / 24}deg)`;
    element.style.setProperty("--drag", String(revealed ? Math.max(-1, Math.min(1, distance / 96)) : 0));
  }

  function settle() {
    const element = surface.current;
    if (element === null) return;
    delete element.dataset.dragging;
    element.style.removeProperty("transform");
    element.style.removeProperty("--drag");
  }

  function leave(remembered: boolean) {
    const element = surface.current;
    if (element === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      grade(remembered);
      return;
    }
    element.dataset.leaving = "true";
    delete element.dataset.dragging;
    element.style.transform = `translateX(${remembered ? "" : "-"}120vw) rotate(${remembered ? 16 : -16}deg)`;
    const finish = (event: TransitionEvent) => {
      if (event.propertyName !== "transform") return;
      element.removeEventListener("transitionend", finish);
      grade(remembered);
    };
    element.addEventListener("transitionend", finish);
  }

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current !== null || surface.current?.dataset.leaving || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startTime: event.timeStamp, dragging: false };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    const distance = event.clientX - current.startX;
    if (!current.dragging) {
      if (Math.abs(distance) <= swipeLockDistance) return;
      current.dragging = true;
    }
    hold(distance);
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    if (current === null) return;
    if (!current.dragging) {
      reveal();
      return;
    }
    const distance = event.clientX - current.startX;
    const elapsed = event.timeStamp - current.startTime;
    if (revealed && carriesWordOff({ distance, elapsed })) leave(false);
    else if (revealed && carriesWordOff({ distance: -distance, elapsed })) leave(true);
    else settle();
  }

  function keyDown(event: KeyboardEvent) {
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
        <>
          <div className="review-deck">
            <div
              key={`${current.card}:${answered}`}
              ref={surface}
              className="review-card"
              onPointerDown={begin}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => {
                drag.current = null;
                settle();
              }}
            >
              <span className="review-stamp review-stamp-remembered" aria-hidden="true">Remembered</span>
              <span className="review-stamp review-stamp-forgot" aria-hidden="true">Forgot</span>
              <p className="review-russian" lang="ru">{current.translation}</p>
              {revealed ? (
                <div className="review-answer" lang="sv">
                  <p className="review-swedish">{current.citation}</p>
                  {current.phonetics.length > 0 ? <p className="review-forms">[{current.phonetics.join(", ")}]</p> : null}
                  {current.forms.length > 1 ? <p className="review-forms">{current.forms.join(", ")}</p> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="review-actions">
            {revealed ? (
              <>
                <button type="button" className="review-answer-button review-forgot" onClick={() => grade(false)}>
                  Forgot<span>{waitLabel(schedule(scheduled, false, now), now)}</span>
                </button>
                <button type="button" className="review-answer-button review-remembered" onClick={() => grade(true)}>
                  Remembered<span>{waitLabel(schedule(scheduled, true, now), now)}</span>
                </button>
              </>
            ) : (
              <button type="button" className="review-answer-button review-show" onClick={reveal}>
                Show Swedish
              </button>
            )}
          </div>
        </>
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
