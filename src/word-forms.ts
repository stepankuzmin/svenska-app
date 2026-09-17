type WordSense = {
  partOfSpeech: string;
  article: string;
  inflections: readonly string[];
};

// Lexin lists a verb as present tense with inflections ordered
// preteritum, supinum, (imperativ,) infinitiv. A noun opens with the article
// its gender calls for, so the forms read the way Swedish teaches them.
function senseForms({
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

// Every sense of one word inflects the same way, give or take the forms Lexin
// spells out for one sense and leaves to another.
export function wordForms({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): string[] {
  const forms = senses.flatMap((sense) => senseForms({ headword, ...sense }));
  return [...new Set(forms)].filter((form) => form.length > 0);
}
