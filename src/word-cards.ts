import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import { cleanLexinText, normalizeLookupText } from "./normalize-lookup-text";
import { wordForms } from "./word-forms";
import { wordKey, wordsOf, type HeadwordWord, type LibraryWord } from "./words";

type DictionaryEntries = DictionaryAsset["entries"];
type DetailsEntries = DictionaryDetailsAsset["entries"];
export type DictionarySense = DictionaryEntries[string][number];
type WordDetails = DetailsEntries[string][number];
type BilingualText = WordDetails["examples"][number];

export type RelatedWord = {
  headword: string;
  translation: string;
};

// One card holds one word: the senses Lexin inflects the same way. A spelling
// that carries an en-word and an ett-word carries two words, so it fills a card
// each, and `card` tells them apart wherever a headword alone cannot.
export type WordCardContent = {
  card: string;
  headword: string;
  partsOfSpeech: string;
  translation: string;
  phonetics: readonly string[];
  forms: readonly string[];
  senses: readonly DictionarySense[];
  hasMeanings: boolean;
  examples: readonly BilingualText[];
  relatedWords: readonly RelatedWord[];
  // A word with nothing beyond its closed line has no extended state.
  extendable: boolean;
};

// A suggestion reads like the closed line of a card, with the Swedish forms
// beneath it — the headword alone for a word with one form.
export type SuggestionRow = {
  headword: string;
  partsOfSpeech: string;
  translation: string;
  forms: string;
};

const relatedWordLimit = 8;

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function joinUnique(values: readonly string[]): string {
  return uniqueNonEmpty(values).join(" · ");
}

function findWord({
  libraryWord: { headword, word },
  entries,
}: {
  libraryWord: LibraryWord;
  entries: DictionaryEntries;
}): { senses: readonly DictionarySense[]; found: HeadwordWord } | null {
  const senses = entries[headword];
  const found = senses === undefined
    ? undefined
    : wordsOf({ headword, senses }).find((item) => item.word === word);
  return senses === undefined || found === undefined ? null : { senses, found };
}

function formsOf({
  headword,
  senses,
  senseIndexes,
  wordDetails,
}: {
  headword: string;
  senses: readonly DictionarySense[];
  senseIndexes: readonly number[];
  wordDetails: readonly WordDetails[];
}): readonly string[] {
  return wordForms({
    headword: cleanLexinText(headword),
    senses: senseIndexes.map((senseIndex) => ({
      partOfSpeech: senses[senseIndex].partOfSpeech,
      article: wordDetails[senseIndex]?.article ?? "",
      inflections: (wordDetails[senseIndex]?.inflections ?? []).map(cleanLexinText),
    })),
  });
}

function relatedWordsOf({
  headword,
  details,
}: {
  headword: string;
  details: readonly WordDetails[];
}): readonly RelatedWord[] {
  const related = new Map<string, RelatedWord>();
  const normalizedHeadword = normalizeLookupText(headword);

  for (const compound of details.flatMap((wordDetails) => wordDetails.compounds)) {
    const compoundHeadword = cleanLexinText(compound.swedish);
    const normalizedCompound = normalizeLookupText(compoundHeadword);
    if (normalizedCompound !== normalizedHeadword) {
      related.set(normalizedCompound, { headword: compoundHeadword, translation: compound.russian });
    }
  }

  return [...related.values()].slice(0, relatedWordLimit);
}

// A library word this dictionary does not carry fills no card.
export function wordCards({
  libraryWords,
  entries,
  details,
}: {
  libraryWords: readonly LibraryWord[];
  entries: DictionaryEntries | null;
  details: DetailsEntries | null;
}): readonly WordCardContent[] {
  if (entries === null) {
    return [];
  }

  return libraryWords.flatMap((libraryWord) => {
    const match = findWord({ libraryWord, entries });
    if (match === null) {
      return [];
    }

    const { headword } = libraryWord;
    const allDetails = details?.[headword] ?? [];
    const { senseIndexes } = match.found;
    const senses = senseIndexes.map((senseIndex) => match.senses[senseIndex]);
    const wordDetails = senseIndexes.flatMap((senseIndex) => allDetails[senseIndex] ?? []);
    const cleanHeadword = cleanLexinText(headword);
    const forms = formsOf({ headword, senses: match.senses, senseIndexes, wordDetails: allDetails });
    const phonetics = uniqueNonEmpty(wordDetails.map(({ phonetic }) => phonetic));
    const examples = wordDetails.flatMap((item) => item.examples);
    const relatedWords = relatedWordsOf({ headword: cleanHeadword, details: wordDetails });
    const hasMeanings = senses.some((sense) => sense.meaning.length > 0);
    return [{
      card: wordKey(libraryWord),
      headword: cleanHeadword,
      partsOfSpeech: joinUnique(senses.map((sense) => sense.partOfSpeech)),
      translation: joinUnique(senses.map((sense) => sense.translation)),
      phonetics,
      forms,
      senses,
      hasMeanings,
      examples,
      relatedWords,
      extendable: phonetics.length > 0 ||
        forms.length > 1 ||
        hasMeanings ||
        examples.length > 0 ||
        relatedWords.length > 0,
    }];
  });
}

export function suggestionRow({
  word,
  entries,
  details,
}: {
  word: LibraryWord;
  entries: DictionaryEntries | null;
  details: DetailsEntries | null;
}): SuggestionRow {
  const cleanHeadword = cleanLexinText(word.headword);
  const match = entries === null ? null : findWord({ libraryWord: word, entries });
  const senses = match === null ? [] : match.found.senseIndexes.map((senseIndex) => match.senses[senseIndex]);
  const forms = match === null ? [] : formsOf({
    headword: word.headword,
    senses: match.senses,
    senseIndexes: match.found.senseIndexes,
    wordDetails: details?.[word.headword] ?? [],
  });
  return {
    headword: cleanHeadword,
    partsOfSpeech: joinUnique(senses.map((sense) => sense.partOfSpeech)),
    translation: joinUnique(senses.map((sense) => sense.translation)),
    forms: (forms.length > 0 ? forms : [cleanHeadword]).join(", "),
  };
}

// A lookup opens the first word its spelling holds.
export function firstCardOf({
  headword,
  entries,
}: {
  headword: string;
  entries: DictionaryEntries | null;
}): string | null {
  const senses = entries?.[headword];
  const [firstWord] = senses === undefined ? [] : wordsOf({ headword, senses });
  return firstWord === undefined ? null : wordKey(firstWord);
}
