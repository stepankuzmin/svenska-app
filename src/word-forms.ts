// Lexin lists a verb as present tense with inflections ordered
// preteritum, supinum, (imperativ,) infinitiv.
export function wordForms({
  headword,
  partOfSpeech,
  inflections,
}: {
  headword: string;
  partOfSpeech: string;
  inflections: readonly string[];
}): string[] {
  if (partOfSpeech !== "verb" || inflections.length < 3) {
    return [headword, ...inflections];
  }

  const [preterite, supine] = inflections;
  const infinitive = inflections[inflections.length - 1];
  return [`att ${infinitive}`, headword, preterite, `har ${supine}`];
}
