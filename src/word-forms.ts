type WordSense = {
  partOfSpeech: string;
  article: string;
  inflections: readonly string[];
};

// Lexin lists a verb as present tense with inflections opening preteritum,
// supinum. A noun opens with the article its gender calls for, so the forms
// read the way Swedish teaches them.
function isInflectedVerb({ partOfSpeech, inflections }: { partOfSpeech: string; inflections: readonly string[] }) {
  return partOfSpeech === "verb" && inflections.length >= 3;
}

function firstWord(phrase: string): string {
  return phrase.split(" ")[0];
}

// After the supine Lexin can list an imperative, an infinitive, an older
// infinitive and the forms of an alternative verb, in no fixed order: `vet`
// ends `veta, vet`, `ger` ends `ge, giv, giva`. The infinitive is the form the
// present tense adds an r to, or else the a-form whose stem it adds er to.
export function infinitiveOf({ present, inflections }: { present: string; inflections: readonly string[] }): string {
  const candidates = inflections.slice(2);
  return candidates.find((form) => `${firstWord(form)}r` === present) ??
    candidates.find((form) => firstWord(form).endsWith("a") && `${firstWord(form).slice(0, -1)}er` === present) ??
    candidates.find((form) => firstWord(form).endsWith("a")) ??
    inflections.at(-1) ?? present;
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

  // Lexin mostly inflects only the verb of a phrase such as `aktar sig`, so
  // the rest of the headword follows every form that does not carry it yet.
  const [preterite, supine] = inflections;
  const present = firstWord(headword);
  const rest = headword.slice(present.length);
  const withRest = (form: string) => (form.endsWith(rest) ? form : `${form}${rest}`);
  const infinitive = infinitiveOf({ present, inflections });
  return [`att ${withRest(infinitive)}`, headword, withRest(preterite), `har ${withRest(supine)}`];
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
// prefix says the word type of the sense it names. A word Lexin inflects
// neither way has no such name.
export function citationForm({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly WordSense[];
}): { form: string; partOfSpeech: string } | null {
  const marked = senses.find((sense) => isInflectedVerb(sense) || sense.article.length > 0);
  return marked === undefined
    ? null
    : { form: senseForms({ headword, ...marked })[0], partOfSpeech: marked.partOfSpeech };
}
