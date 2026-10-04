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

const supineEnding = /(it|tt|[^aeiouyåäö]t)$/u;
const weakPreteriteEnding = /de$/u;

// Lexin lists every preterite before every supine, so a verb with two
// preterites puts the second where the supine stands: `beslutar` reads
// `beslutade, beslöt, beslutit, beslutat`, `säger` `sade, sa, sagt`. The supine
// is the first later form shaped like one: `-it`, `-tt` or a consonant and t,
// as no strong preterite such as `beslöt` ends, or the supine the preterite
// gives away, `simmade` `simmat`. A word card shows the first preterite and
// supine, so the build leaves out the preterites between them, and the present
// Lexin now and then repeats first, as `omsätter` does.
export function verbInflections({ present, inflections }: { present: string; inflections: readonly string[] }): string[] {
  const own = inflections.length > 3 && firstWord(inflections[0]) === present ? inflections.slice(1) : inflections;
  const weakSupine = firstWord(own[0] ?? "").replace(weakPreteriteEnding, "t");
  const supineIndex = own.findIndex((form, index) =>
    index > 0 && (supineEnding.test(firstWord(form)) || firstWord(form) === weakSupine));
  return own.length < 3 || supineIndex === -1 ? [...own] : [own[0], ...own.slice(supineIndex)];
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

function named(sense: WordSense): boolean {
  return isInflectedVerb(sense) || sense.article.length > 0;
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
  // A sense the word names by its citation leads, so a verb that takes in a
  // bare noun sense of its spelling, as `går` takes in `i går`, still opens
  // with `att gå`.
  const forms: string[] = [];
  for (const sense of [...senses.filter(named), ...senses.filter((sense) => !named(sense))]) {
    const spelled = new Map<string, number>();
    for (const form of senseForms({ headword, ...sense })) {
      const count = (spelled.get(form) ?? 0) + 1;
      spelled.set(form, count);
      // A noun's article already spells out the bare headword of a sense
      // that takes no article.
      const articled = !named(sense) && (forms.includes(`en ${form}`) || forms.includes(`ett ${form}`));
      if (form.length > 0 && !articled && forms.filter((known) => known === form).length < count) {
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
  const marked = senses.find(named);
  return marked === undefined
    ? null
    : { form: senseForms({ headword, ...marked })[0], partOfSpeech: marked.partOfSpeech };
}
