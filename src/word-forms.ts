// Lexin lists a verb as present tense with inflections ordered
// preteritum, supinum, (imperativ,) infinitiv. A noun opens with the article
// its gender calls for, so the forms read the way Swedish teaches them.
export function wordForms({
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
    return [article.length > 0 ? `${article} ${headword}` : headword, ...inflections];
  }

  const [preterite, supine] = inflections;
  const infinitive = inflections[inflections.length - 1];
  return [`att ${infinitive}`, headword, preterite, `har ${supine}`];
}
