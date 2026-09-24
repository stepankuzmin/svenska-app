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
  const infinitive = inflections.at(-1);
  return [`att ${infinitive}`, headword, preterite, `har ${supine}`];
}

// Every sense of one word inflects the same way, give or take the forms Lexin
// spells out for one sense and leaves to another. A paradigm can spell one
// form twice — the adjective `fast, fast, fasta` has a neuter like its
// headword — so the senses merge by how often each spells a form, not into a
// set.
export function wordForms({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): string[] {
  const forms: string[] = [];
  for (const sense of senses) {
    const spelled = new Map<string, number>();
    for (const form of senseForms({ headword, ...sense })) {
      const count = (spelled.get(form) ?? 0) + 1;
      spelled.set(form, count);
      if (form.length > 0 && forms.filter((known) => known === form).length < count) {
        forms.push(form);
      }
    }
  }
  return forms;
}
