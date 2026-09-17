type WordSense = {
  partOfSpeech: string;
  article: string;
  inflections: readonly string[];
};

// Lexin lists a verb as present tense with inflections ordered
// preteritum, supinum, (imperativ,) infinitiv. A noun opens with the article
// its gender calls for, so the forms read the way Swedish teaches them.
function wordForms({
  headword,
  partOfSpeech,
  article,
  inflections,
}: {
  headword: string;
  partOfSpeech: string;
  article: string;
  inflections: readonly string[];
}): string[] {
  if (partOfSpeech !== "verb" || inflections.length < 3) {
    // Lexin writes the odd definite singular as the bare ending, which repeats
    // the article the headword already opens with.
    return [
      article.length > 0 ? `${article} ${headword}` : headword,
      ...inflections.filter((form) => form !== article),
    ];
  }

  const [preterite, supine] = inflections;
  const infinitive = inflections[inflections.length - 1];
  return [`att ${infinitive}`, headword, preterite, `har ${supine}`];
}

function covers({ line, other }: { line: readonly string[]; other: readonly string[] }): boolean {
  return line.every((form) => other.includes(form));
}

// One spelling can carry paradigms that do not belong on the same line: an
// en-word and an ett-word, or a noun and a verb. Each keeps its own line, and
// a paradigm another line already spells out in full keeps none.
export function wordFormLines({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): string[][] {
  const lines = senses.map((sense) => [...new Set(wordForms({ headword, ...sense }))]
    .filter((form) => form.length > 0));

  return lines.filter((line, index) =>
    line.length > 1 &&
    !lines.some((other, otherIndex) =>
      otherIndex !== index &&
      other.length > 1 &&
      covers({ line, other }) &&
      (other.length > line.length || (other.length === line.length && otherIndex < index)),
    ));
}
