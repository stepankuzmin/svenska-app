import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { importKelly, kellyFrequencies } from "../scripts/import-kelly";

function source(rows: Record<string, string>[]) {
  return `<LexicalResource><Lexicon>${rows.map((features) => `<LexicalEntry><Lemma><FormRepresentation>${
    Object.entries(features).map(([att, val]) => `<feat att="${att}" val="${val}"/>`).join("")
  }</FormRepresentation></Lemma></LexicalEntry>`).join("")}</Lexicon></LexicalResource>`;
}

const xml = source([
  { writtenForm: "val", kellyPartOfSpeech: "noun-en", gram: "en", rawFreq: "1565" },
  { writtenForm: "val", kellyPartOfSpeech: "noun-ett", gram: "ett", rawFreq: "30773" },
  { writtenForm: "vara", kellyPartOfSpeech: "verb", rawFreq: "2624032" },
  { writtenForm: "fast", kellyPartOfSpeech: "conj", rawFreq: "9929" },
  { writtenForm: "fast", kellyPartOfSpeech: "subj", rawFreq: "6043" },
  { writtenForm: "brunch", kellyPartOfSpeech: "noun-en", rawFreq: "", wpm: "1000000,00" },
  { writtenForm: "test", kellyPartOfSpeech: "noun-en/-ett", rawFreq: "20" },
]);

it("imports measured counts by citation and type, excluding manual entries with artificial frequencies", () => {
  expect(kellyFrequencies(xml)).toEqual({
    "en val#subst.": 1565, "ett val#subst.": 30773, "att vara#verb": 2624032,
    "fast#konj.": 15972, "en test#subst.": 20, "ett test#subst.": 20,
  });
  expect(() => kellyFrequencies(source([{ writtenForm: "test", kellyPartOfSpeech: "unknown", rawFreq: "1" }])))
    .toThrow("Unknown Kelly word type");
  expect(() => kellyFrequencies("<invalid/>")).toThrow();
});

it("writes a reproducible frequency dataset from a source file", async () => {
  const root = await mkdtemp(join(tmpdir(), "svenska-kelly-"));
  try {
    const input = join(root, "kelly.xml");
    await writeFile(input, xml);
    await importKelly(input, pathToFileURL(`${root}/data/`));
    expect(JSON.parse(await readFile(join(root, "data/frequencies.json"), "utf8")))
      .toEqual({ "en val#subst.": 1565, "ett val#subst.": 30773, "att vara#verb": 2624032,
        "fast#konj.": 15972, "en test#subst.": 20, "ett test#subst.": 20 });
  } finally { await rm(root, { recursive: true }); }
});
