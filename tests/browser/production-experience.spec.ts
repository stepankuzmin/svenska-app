import { expect, test, type Page } from "@playwright/test";

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin",
    license: "CC BY 4.0",
  },
  entries: {
    fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
  },
  russianIndex: {
    "перерыв на кофе": ["fika", "fikapaus"],
  },
};

async function openReadyApp(page: Page) {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Look up" })).toBeEnabled();
}

test("the reading order, keyboard path, accessible names, and attribution are complete", async ({ page }) => {
  await openReadyApp(page);

  const mainChildren = page.locator("main > *");
  await expect(mainChildren.nth(1)).toHaveClass("search");
  await expect(mainChildren.nth(2)).toHaveClass("lookup");
  await expect(mainChildren.nth(3)).toHaveClass("library");

  const query = page.getByLabel("Swedish or Russian word");
  await page.getByRole("link", { name: "Library" }).focus();
  await page.keyboard.press("Tab");
  await expect(query).toBeFocused();
  await query.fill("fik");
  await query.press("Enter");
  await expect(page.getByRole("button", { name: "fika, перерыв на кофе" })).toBeVisible();
  await page.getByRole("button", { name: "fika, перерыв на кофе" }).press("Enter");
  await expect(page.getByRole("heading", { name: "fika" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open fika, перерыв на кофе" })).toBeVisible();

  const status = page.getByRole("status");
  await expect(status).toBeEmpty();
  await expect(page.getByText("Lexin", { exact: true })).toBeVisible();
  await expect(page.getByText("Institute for Language and Folklore (ISOF)", { exact: true })).toBeVisible();
  await expect(page.getByText("Source edition: 2010-07-07", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /CC BY 4.0/ })).toBeVisible();
});

test("the paper layout fits narrow and zoomed viewports with visible focus and sufficient contrast", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyApp(page);

  expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);
  await expect(page.locator("main")).toHaveCSS("max-width", "640px");
  await expect(page.locator("html")).toHaveCSS("font-family", "system-ui, sans-serif");

  const query = page.getByLabel("Swedish or Russian word");
  await query.focus();
  await expect(query).not.toHaveCSS("outline-style", "none");

  const contrastChecksPass = await page.evaluate(`(() => {
    function luminance(color) {
      const channels = color.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }

    function ratio(foreground, background) {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    }

    const body = getComputedStyle(document.body);
    const input = getComputedStyle(document.querySelector("input"));
    const button = getComputedStyle(document.querySelector("button"));
    const link = getComputedStyle(document.querySelector("a"));
    const footer = getComputedStyle(document.querySelector("footer"));
    return [
      ratio(body.color, body.backgroundColor) >= 4.5,
      ratio(input.color, input.backgroundColor) >= 4.5,
      ratio(input.borderTopColor, body.backgroundColor) >= 3,
      ratio(button.color, button.backgroundColor) >= 4.5,
      ratio(link.color, body.backgroundColor) >= 4.5,
      ratio(footer.color, body.backgroundColor) >= 4.5,
      ratio(input.outlineColor, body.backgroundColor) >= 3,
    ].every(Boolean);
  })()`);
  expect(contrastChecksPass).toBe(true);

  await expect(query).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("link", { name: /CC BY 4.0/ })).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate("document.documentElement.style.zoom = '2'");
  expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);
  await expect(query).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
});

test("dictionary loading is the only announced interstitial state", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", () => new Promise(() => {}));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Loading dictionary…");
});

test("reduced motion leaves the reading experience free of scrolling motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReadyApp(page);
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
});
