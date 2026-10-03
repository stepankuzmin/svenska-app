import { citedQuery, isWordCharacter } from "./dictionary";
import { normalizeSwedishLookupText } from "./normalize-lookup-text";

export type QueryMatch = { start: number; end: number };

// A suggestion marks the one form, or translation, the query spells, ranked
// as the search ranks them: a whole word first, then the start of one, then
// a match inside one. `minskade` marks the preterite, `mins` the infinitive,
// `дом` the `дом` of `жилой дом`.
export function queryMatch({ text, query }: { text: string; query: string }): QueryMatch | null {
  // Swedish and Russian lower case keep every letter's length, so an offset
  // into the lowered text points at the same letter of the shown one.
  const lowered = text.toLocaleLowerCase("sv-SE");
  // The query drops Lexin segment markers the way the lookup does.
  const typed = normalizeSwedishLookupText(query);

  // `att minska` is looked up as typed and then as the `minska` its citation
  // opens, so a row marks whichever of the two it spells.
  for (const needle of [typed, typed.match(citedQuery)?.[2]]) {
    if (!needle) {
      continue;
    }

    let best: QueryMatch | null = null;
    let bestRank = 3;
    for (let start = lowered.indexOf(needle); start !== -1; start = lowered.indexOf(needle, start + 1)) {
      const end = start + needle.length;
      const rank = isWordCharacter(lowered[start - 1]) ? 2 : isWordCharacter(lowered[end]) ? 1 : 0;
      if (rank < bestRank) {
        best = { start, end };
        bestRank = rank;
      }
    }
    if (best !== null) {
      return best;
    }
  }

  return null;
}
