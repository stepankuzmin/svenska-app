import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const fikaNoun = /^fika substantiv/;

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    fika: [{ word: "101", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
  },
  swedishIndex: { fika: ["101"], fikapaus: ["102"] },
  russianIndex: { "перерыв на кофе": ["101", "102"] },
  relatedIndex: {},
  wordAliases: {},
};

const gesture = (page: Page, points: [number, number][], lifted = true) => page.evaluate(({ points, lifted }) => {
  const touch = (type: string, touches: { clientX: number; clientY: number }[]) => {
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const prevented = points.map(([clientX, clientY], index) => touch(index === 0 ? "touchstart" : "touchmove", [{ clientX, clientY }]));
  if (lifted) touch("touchend", []);
  return prevented;
}, { points, lifted });

test("a tap opens a suggested word without the field grabbing focus first", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");

  // A coarse pointer cannot raise a keyboard, so the caret waits for a tap.
  const query = page.getByLabel("Swedish or Russian word");
  await expect(query).toBeVisible();
  await expect(query).not.toBeFocused();

  await query.fill("fik");
  await page.getByRole("option", { name: fikaNoun }).tap();

  await expect(query).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
  await expect(page.locator(".word-card[open] summary strong")).toHaveText("en fika");
});

test("pulling the top of the page down shows the sync spinner, and a short pull does not", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  const pull = (distance: number) => gesture(page, [[100, 100], [100, 100 + distance]]);

  await pull(60);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toHaveCount(0);
  await expect(page.locator(".minimal-lookup")).toHaveCSS("transform", "none");
  await pull(300);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toBeInViewport();
  await expect(page.locator(".minimal-lookup")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 60)");
  const spinner = (await page.locator(".pull-to-sync svg").boundingBox())!;
  expect(spinner.x + spinner.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toHaveCount(0);
  await expect(page.locator(".minimal-lookup")).toHaveCSS("transform", "none");
});

test("a small sideways wobble at the start of a pull still syncs", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await gesture(page, [[100, 100], [103, 101], [100, 400]]);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toBeInViewport();
});

test("a pull on a landscape phone reaches the sync without leaving the screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 340 });
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await gesture(page, [[100, 170], [100, 330]]);
  await expect(page.locator(".minimal-lookup")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 60)");
});

test("a pull taken back above its start closes the gap at once", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await gesture(page, [[100, 300], [100, 324], [100, 200]], false);
  await expect(page.locator(".minimal-lookup")).toHaveCSS("transform", "none");
});

test("a pull keeps the browser from scrolling, and a swipe up leaves it free", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  expect(await gesture(page, [[100, 100], [100, 150]])).toEqual([false, true]);
  expect(await gesture(page, [[100, 300], [100, 250]])).toEqual([false, false]);
});

test("the spinner keeps its place on the page while a released pull settles", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await gesture(page, [[100, 100], [100, 500]]);
  const gaps = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const main = document.querySelector(".minimal-lookup")!;
    const spinner = document.querySelector(".pull-to-sync svg")!;
    const samples: number[] = [];
    const sample = () => {
      const { top, height } = spinner.getBoundingClientRect();
      samples.push(top + height / 2 - main.getBoundingClientRect().top);
      if (samples.length < 15) requestAnimationFrame(sample);
      else resolve(samples);
    };
    sample();
  }));
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
});

test("the page stays under the finger during a pull", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await gesture(page, [[100, 100], [100, 400]], false);
  const main = page.locator(".minimal-lookup");
  await expect(main).toHaveCSS("transition-duration", "0s");
  expect(await main.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBeGreaterThan(100);
});
