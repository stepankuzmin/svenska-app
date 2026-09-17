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

function covers({ forms, other }: { forms: readonly string[]; other: readonly string[] }): boolean {
  return forms.every((form) => other.includes(form));
}

export type WordParadigm = {
  forms: string[];
  senseIndexes: number[];
};

// One spelling can carry several words: an en-word and an ett-word, or a noun
// and a verb. Each paradigm makes a word of its own, and every sense Lexin
// inflects the same way belongs to it.
export function wordParadigms({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): WordParadigm[] {
  const paradigms: WordParadigm[] = [];

  senses.forEach((sense, index) => {
    const forms = [...new Set(wordForms({ headword, ...sense }))]
      .filter((form) => form.length > 0);
    const shared = paradigms.find((paradigm) =>
      covers({ forms, other: paradigm.forms }) || covers({ forms: paradigm.forms, other: forms }));
    if (shared === undefined) {
      paradigms.push({ forms, senseIndexes: [index] });
      return;
    }

    if (forms.length > shared.forms.length) {
      shared.forms = forms;
    }
    shared.senseIndexes.push(index);
  });

  return paradigms;
}
