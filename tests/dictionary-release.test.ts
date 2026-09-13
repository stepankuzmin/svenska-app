import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateDictionaryRelease } from "../scripts/validate-dictionary-release.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function releaseDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "svenska-release-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("dictionary release contract", () => {
  it("accepts a content-hashed dictionary and repository-relative application assets", async () => {
    const directory = await releaseDirectory();
    await writeFile(
      join(directory, "lexin-dictionary.a05dae6a54854ab3.json"),
      '{"metadata":{"sourceEditionDate":"2010-07-07","attribution":"Lexin","license":"CC BY 4.0"},"entries":{"bok":[{"partOfSpeech":"subst.","meaning":"","translation":"книга"}]},"swedishIndex":{"bok":["bok"],"boken":["bok"]},"russianIndex":{"книга":["bok"]}}\n',
    );
    await writeFile(
      join(directory, "lexin-details.8b49adde90b45818.json"),
      '{"sourceEditionDate":"2010-07-07","entries":{"bok":[{"phonetic":"bu:k","inflections":["boken"],"examples":[],"compounds":[]}]}}\n',
    );
    await writeFile(
      join(directory, "index.html"),
      '<script type="module" src="./assets/app.js"></script><link rel="manifest" href="./manifest.webmanifest">',
    );
    await writeFile(
      join(directory, "sw.js"),
      'precacheAndRoute([{url:"index.html"},{url:"lexin-dictionary.a05dae6a54854ab3.json"},{url:"lexin-details.8b49adde90b45818.json"}]);',
    );

    await expect(
      validateDictionaryRelease({ basePath: "/svenska-app/", directory, sourceEditionDate: "2010-07-07" }),
    ).resolves.toBeUndefined();
  });

  it("rejects root-relative assets that would escape a GitHub Pages repository path", async () => {
    const directory = await releaseDirectory();
    await writeFile(join(directory, "index.html"), '<script type="module" src="/assets/app.js"></script>');

    await expect(
      validateDictionaryRelease({ basePath: "/svenska-app/", directory, sourceEditionDate: "2010-07-07" }),
    ).rejects.toThrow("root-relative asset URL");
  });
});
