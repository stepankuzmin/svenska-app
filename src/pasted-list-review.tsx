import { useState } from "react";
import type { DictionaryAsset } from "./dictionary-contract";
import { newWordsOf, pastedListText, type PastedLine, type PastedList } from "./lookup-session";
import { wordCards } from "./word-cards";
import type { LibraryWord } from "./words";
import "./pasted-list-review.css";

export default function PastedListReview({ pastedList, entries, libraryWords, onAdd, onClose }: {
  pastedList: PastedList;
  entries: DictionaryAsset["entries"];
  libraryWords: readonly LibraryWord[];
  onAdd: (lines: readonly PastedLine[], words: readonly LibraryWord[]) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<{ pastedList: PastedList; label: string } | null>(null);
  const [unticked, setUnticked] = useState<{ pastedList: PastedList; lines: ReadonlySet<number> } | null>(null);
  const skipped = unticked?.pastedList === pastedList ? unticked.lines : new Set<number>();
  const { lines, added } = pastedList;
  if (added) {
    const text = pastedListText({ lines, entries });
    return (
      <section className="pasted-list" aria-label="Pasted list">
        <pre className="pasted-list-preview">{text}</pre>
        <div className="pasted-list-actions">
          <button type="button" onClick={onClose}>Done</button>
          <button
            type="button"
            className="pasted-list-primary"
            onClick={() => {
              navigator.clipboard.writeText(text)
                .then(() => setCopied({ pastedList, label: "Copied" }), () => setCopied({ pastedList, label: "Copy failed" }));
            }}
          >
            {copied?.pastedList === pastedList ? copied.label : "Copy list with Russian"}
          </button>
        </div>
      </section>
    );
  }

  const chosen = lines.map((line, index) => (skipped.has(index) ? { ...line, words: [] } : line));
  const newWords = newWordsOf(chosen.flatMap(({ words }) => words), libraryWords);
  const count = newWords.length;
  const translated = chosen.some(({ words }) => words.length > 0);
  return (
    <section className="pasted-list" aria-label="Pasted list">
      <ul className="pasted-list-lines" role="list">
        {lines.map(({ line, words }, index) => {
          if (line.trim().length === 0) return null;
          if (words.length === 0) {
            return <li key={index} className="pasted-line" data-state="unmatched" aria-label={`${line.trim()}, no match`}>{line.trim()}</li>;
          }
          const cards = wordCards({ libraryWords: words, entries, details: null });
          const name = cards.map((card) => `${card.citation} ${card.translation}`.trim()).join("; ");
          const text = cards.map((card) => (
            <span key={card.card}>
              <strong lang="sv">{card.citation}</strong>
              {card.translation ? <span lang="ru">{` ${card.translation}`}</span> : null}
            </span>
          ));
          if (newWordsOf(words, libraryWords).length === 0) {
            return <li key={index} className="pasted-line" data-state="known" aria-label={`${name}, already in library`}>{text}</li>;
          }
          const ticked = !skipped.has(index);
          return (
            <li key={index} className="pasted-line" data-state="found" aria-label={`${name}, ${ticked ? "will be added" : "skipped"}`}>
              <label>
                <input
                  type="checkbox"
                  checked={ticked}
                  aria-label={name}
                  onChange={() => {
                    const next = new Set(skipped);
                    if (ticked) next.add(index);
                    else next.delete(index);
                    setUnticked({ pastedList, lines: next });
                  }}
                />
                {text}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="pasted-list-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="pasted-list-primary" disabled={!translated} onClick={() => onAdd(chosen, newWords)}>
          {count === 0 && translated ? "Show list with Russian" : `Add ${count} ${count === 1 ? "word" : "words"}`}
        </button>
      </div>
    </section>
  );
}
