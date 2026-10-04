import { citedQuery } from "./dictionary";
import { normalizeSwedishLookupText } from "./normalize-lookup-text";

export type QueryMatch = { start: number; end: number };

// A suggestion marks every place its text spells the query, so the rule is
// one a reader can check by eye: `minsk` marks each of `att minska, minskar,
// minskade, har minskat`, and `дом` each `дом` of a translation. A query that
// opens with a citation, `att minska`, is marked as typed where the row
// spells it so, and otherwise as the `minska` it names.
export function queryMatches({ text, query }: { text: string; query: string }): QueryMatch[] {
  // Swedish and Russian lower case keep every letter's length, so an offset
  // into the lowered text points at the same letter of the shown one.
  const lowered = text.toLocaleLowerCase("sv-SE");
  // The query drops Lexin segment markers the way the lookup does.
  const typed = normalizeSwedishLookupText(query);
  for (const needle of [typed, typed.match(citedQuery)?.[2]]) {
    if (!needle) {
      continue;
    }

    const matches: QueryMatch[] = [];
    for (let start = lowered.indexOf(needle); start !== -1; start = lowered.indexOf(needle, start + needle.length)) {
      matches.push({ start, end: start + needle.length });
    }
    if (matches.length > 0) {
      return matches;
    }
  }
  return [];
}

const citationPrefixes = ["", "att ", "har ", "en ", "ett "];

// A form the search found that the row's forms leave out, such as the
// comparative `abnormare` of `abnorm`, leads them before a dot, where a
// narrow row cannot clip it. Forms are compared whole between the row's
// separators, with or without the `att`, `har` or article a citation adds,
// since a Lexin form can hold a comma of its own: `äldre, äldst`.
export function withForm({ forms, form }: { forms: string; form: string }): string {
  return citationPrefixes.some((prefix) => `, ${forms}, `.includes(`, ${prefix}${form}, `))
    ? forms
    : `${form} · ${forms}`;
}
