import { expect, test, vi } from "vitest";
import { commands, page } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    tapSuggestion: (name: string) => Promise<void>;
  }
}

test("a mobile tap opens a suggested word", async () => {
  const dictionary = {
    metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
    entries: {
      fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
      fikapaus: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    },
    swedishIndex: { fika: ["fika"], fikapaus: ["fikapaus"] },
    russianIndex: { "перерыв на кофе": ["fika", "fikapaus"] },
  };
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => dictionary }));
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  await import("../src/main");

  const query = page.getByLabelText("Swedish or Russian word");
  await query.fill("fik");
  await expect.element(page.getByRole("option", { name: "fika", exact: true })).toBeVisible();
  await commands.tapSuggestion("fika");
  await expect.element(query).toHaveValue("fika");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await expect.element(page.getByRole("region", { name: "Library" })).toBeVisible();
  expect(root.querySelector(".word-card[open] summary strong")?.textContent).toBe("fika");
});
