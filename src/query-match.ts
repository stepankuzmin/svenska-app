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

const citationPrefixes = ["", "att ", "har ", "en ", "ett "] as const;

// A Swedish row marks the query inside the indexed form that offered it, so
// `ett` marks the `ett` of `bett`, not the article of `ett bett`; a query that
// opens the way a citation does also marks that citation's `att`, `har` or
// article. A form the row's forms leave out, such as the comparative
// `abnormare`, leads them before a dot, where a narrow row cannot clip it.
// Forms are matched whole between the row's separators, since a Lexin form
// can hold a comma of its own: `äldre, äldst`.
export function formMatch({ forms, form, query }: { forms: string; form: string; query: string }): {
  text: string;
  match: QueryMatch | null;
} {
  let start = 0;
  let prefix = "";
  let text = `${form} · ${forms}`;
  for (const candidate of citationPrefixes) {
    const index = `, ${forms}, `.indexOf(`, ${candidate + form}, `);
    if (index !== -1) {
      [start, prefix, text] = [index, candidate, forms];
      break;
    }
  }

  const from = citedQuery.test(normalizeSwedishLookupText(query)) ? start : start + prefix.length;
  const match = queryMatch({ text: text.slice(from, start + prefix.length + form.length), query });
  return { text, match: match && { start: match.start + from, end: match.end + from } };
}
