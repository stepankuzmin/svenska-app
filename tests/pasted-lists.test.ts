import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDictionaryAssets } from "../scripts/build-dictionary.ts";
import { createSearch } from "../src/dictionary-search";
import { pastedLinesOf, pastedListText } from "../src/lookup-session";

const listFile = /\.txt$/u;
const directory = new URL("./fixtures/pasted-lists/", import.meta.url);
const lists = readdirSync(directory).filter((file) => file.endsWith(".txt") && !file.endsWith(".copy.txt"));

let dictionary: ReturnType<typeof buildDictionaryAssets>["dictionary"];
let search: ReturnType<typeof createSearch>;

beforeAll(() => {
  ({ dictionary } = buildDictionaryAssets({ xml: readFileSync(new URL("../data/lexin/swe_rus-2010-07-07.xml", import.meta.url), "utf8") }));
  search = createSearch({ dictionary });
});

describe("pasted lists", () => {
  it.each(lists)("copies %s with its Russian", (file) => {
    const pasted = readFileSync(new URL(file, directory), "utf8");
    const expected = readFileSync(new URL(file.replace(listFile, ".copy.txt"), directory), "utf8");
    expect(pastedListText({ lines: pastedLinesOf(pasted, search), entries: dictionary.entries })).toBe(expected);
  });
});
