type WordSense = {
  partOfSpeech: string;
  article: string;
  inflections: readonly string[];
};

// Lexin lists a verb as present tense with inflections ordered
// preteritum, supinum, (imperativ,) infinitiv. A noun opens with the article
// its gender calls for, so the forms read the way Swedish teaches them.
function isInflectedVerb({ partOfSpeech, inflections }: { partOfSpeech: string; inflections: readonly string[] }) {
  return partOfSpeech === "verb" && inflections.length >= 3;
}

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
  if (!isInflectedVerb({ partOfSpeech, inflections })) {
    // Lexin writes the odd definite singular as the bare ending, which repeats
    // the article the headword already opens with.
    return [
      article.length > 0 ? `${article} ${headword}` : headword,
      ...inflections.filter((form) => form !== article),
    ];
  }

  // Lexin inflects only the verb of a phrase such as `aktar sig`, so the rest
  // of the headword follows every form.
  const [preterite, supine] = inflections;
  const infinitive = inflections.at(-1);
  const rest = headword.slice(headword.split(" ")[0].length);
  return [`att ${infinitive}${rest}`, headword, `${preterite}${rest}`, `har ${supine}${rest}`];
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

// A verb is named by its infinitive and a noun by its article, and either
// prefix says the word type a label would. A word Lexin inflects neither way
// has no such name.
export function citationForm({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): string | null {
  const marked = senses.find((sense) => isInflectedVerb(sense) || sense.article.length > 0);
  return marked === undefined ? null : senseForms({ headword, ...marked })[0];
}
