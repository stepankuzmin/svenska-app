import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const reviewButton = /^Review/;

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    fika: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    tack: [{ word: "103", partOfSpeech: "interjektion", meaning: "", translation: "спасибо", frequency: 100 }],
    dags: [{ word: "2685", partOfSpeech: "adverb", meaning: "det är tid", translation: "" }],
    tfa: [{ word: "16868", partOfSpeech: "förkortning", meaning: "", translation: "долгий перевод ".repeat(25) }],
  },
  swedishIndex: { fika: ["102"], tack: ["103"], dags: ["2685"], tfa: ["16868"] },
  russianIndex: { "перерыв на кофе": ["102"], "спасибо": ["103"] },
  relatedIndex: {},
  wordAliases: {},
};

async function openWithLibrary(page: Page) {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.addInitScript(() => {
    if (localStorage.getItem("svenska.lookup-library") === null) {
      localStorage.setItem("svenska.lookup-library", JSON.stringify([
        { headword: "dags", word: "2685" },
        { headword: "tack", word: "103" },
        { headword: "fika", word: "102" },
      ]));
    }
  });
  await page.goto(".");
}

async function swipe(page: Page, distance: number) {
  const card = page.locator(".review-card");
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance / 2, y, { steps: 4 });
  await page.mouse.move(x + distance, y, { steps: 4 });
  await page.mouse.up();
}

test("a review shows the Russian, reveals the Swedish, and swipes record the answer", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: "Review 2 due" }).click();

  const review = page.getByRole("dialog", { name: "Review" });
  await expect(review.locator(".review-russian")).toHaveText("перерыв на кофе");
  await expect(review.locator(".review-swedish")).toBeHidden();

  await review.locator(".review-card").click();
  await expect(review.locator(".review-swedish")).toHaveText("en fika");
  await expect(review.locator(".review-stamp-forgot")).toHaveText("Forgot · 1 min");
  await expect(review.locator(".review-stamp-remembered")).toHaveText("Remembered · 10 min");
  await expect(review.getByRole("button")).toHaveText(["Done", "Undo"]);

  await swipe(page, 240);
  await expect(review.locator(".review-russian")).toHaveText("спасибо");

  await review.locator(".review-card").click();
  await swipe(page, -240);
  await expect(review.locator(".review-counts")).toHaveText("0 new2 learning0 to review");

  await review.getByRole("button", { name: "Undo" }).click();
  await expect(review.locator(".review-swedish")).toHaveText("ett tack");
  await page.keyboard.press("ArrowLeft");
  await expect(review.locator(".review-counts")).toHaveText("0 new2 learning0 to review");

  await page.reload();
  const tally = await page.evaluate(() => JSON.parse(localStorage.getItem("svenska.review")!).days);
  expect(Object.values(tally)).toEqual([{ remembered: 1, forgot: 1, reviewed: 0 }]);
  await expect(page.getByRole("dialog", { name: "Review" })).toBeVisible();
});

test("sorting the library keeps the review queue unchanged", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("combobox", { name: "Sort words" }).selectOption("frequency");
  await page.getByRole("button", { name: "Review 2 due" }).click();
  await expect(page.getByRole("dialog", { name: "Review" }).locator(".review-russian")).toHaveText("перерыв на кофе");
});

test("two open tabs keep the answers of both", async ({ page, context }) => {
  await openWithLibrary(page);
  const other = await context.newPage();
  await other.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await other.goto(".");
  await expect(other.getByRole("button", { name: "Review 2 due" })).toBeVisible();

  await page.getByRole("button", { name: "Review 2 due" }).click();
  await page.locator(".review-card").click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Done" }).click();

  await other.bringToFront();
  await other.getByRole("button", { name: reviewButton }).click();
  await other.locator(".review-card").click();
  await other.keyboard.press("ArrowLeft");

  const days = await other.evaluate(() => JSON.parse(localStorage.getItem("svenska.review")!).days);
  expect(Object.values(days)).toEqual([{ remembered: 1, forgot: 1, reviewed: 0 }]);
});

test("an undo during a swipe leaves the next swipe working", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  await page.keyboard.press("ArrowRight");
  await page.locator(".review-card").click();
  await swipe(page, 240);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".review-swedish")).toHaveText("en fika");
  await expect(page.locator(".review-card")).toHaveCSS("transform", "none");
  await swipe(page, 240);
  await expect(page.locator(".review-russian")).toHaveText("спасибо");
});

test("Space shows the next card after a click on Undo", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.locator(".review-swedish")).toHaveText("ett tack");
});

test("keys answer at once, and a tap brings the motion back", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await expect(page.locator(".review-card")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.locator(".review-answer")).toHaveCSS("transition-duration", "0s");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".review-card")).toHaveCSS("transition-duration", "0s");
  await page.locator(".review-card").click();
  await expect(page.locator(".review-card")).not.toHaveCSS("transition-duration", "0s");
});

test("a library of words without Russian offers no review", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("svenska.lookup-library", JSON.stringify([{ headword: "dags", word: "2685" }])));
  await openWithLibrary(page);
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: reviewButton })).toHaveCount(0);
});

test("a press released just off the card leaves later hovers and clicks alone", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  const box = (await page.locator(".review-card").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 3, y);
  await page.mouse.down();
  await page.mouse.move(box.x - 4, y);
  await page.mouse.up();
  await page.mouse.move(box.x + 200, y, { steps: 10 });
  await expect(page.locator(".review-card")).toHaveCSS("transform", "none");
});

test("an open review brings in the next day's words when the app comes back", async ({ page }) => {
  await page.clock.install();
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  for (let answer = 0; answer < 4; answer++) {
    await page.locator(".review-card").click();
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible();
  await page.clock.fastForward("24:00:00");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".review-counts")).toHaveText("0 new0 learning2 to review");
});

test("a long translation scrolls on a phone and can still be answered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.addInitScript(() => localStorage.setItem("svenska.lookup-library", JSON.stringify([{ headword: "tfa", word: "16868" }])));
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".review-counts")).toHaveText("0 new1 learning0 to review");
});

test("the review button counts what fell due while the page stayed open", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const due = Date.now() + 3_600_000;
    const reviewing = { phase: "review", step: 0, interval: 1, ease: 2.5, due, introduced: 0, remembered: 1, forgot: 0 };
    localStorage.setItem("svenska.review", JSON.stringify({ schedules: { "fika#102": reviewing, "tack#103": reviewing }, days: {} }));
  });
  await openWithLibrary(page);
  await expect(page.getByRole("button", { name: "Review Done for today" })).toBeVisible();
  await page.clock.fastForward("02:00:00");
  await page.getByRole("button", { name: reviewButton }).click();
  await expect(page.locator(".review-counts")).toHaveText("0 new0 learning2 to review");
});

test("the card text stays vertically centred before and after the Swedish shows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  const card = middle((await page.locator(".review-card").boundingBox())!);
  expect(middle((await page.locator(".review-russian").boundingBox())!)).toBeCloseTo(card, 0);
  await page.locator(".review-card").click();
  await expect(page.locator(".review-swedish")).toBeVisible();
  const top = (await page.locator(".review-russian").boundingBox())!.y;
  const bottom = await page.locator(".review-answer-body").boundingBox();
  expect((top + bottom!.y + bottom!.height) / 2).toBeCloseTo(card, 0);
});

test("a flick decides the answer by the way the finger moves when it lets go", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  const box = (await page.locator(".review-card").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(x + 60, y, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator(".review-russian")).toHaveText("спасибо");
  const days = await page.evaluate(() => JSON.parse(localStorage.getItem("svenska.review")!).days);
  expect(Object.values(days)).toEqual([{ remembered: 0, forgot: 1, reviewed: 0 }]);
});

test("a flick after a pause carries the card off", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  const box = (await page.locator(".review-card").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 4 });
  await page.waitForTimeout(600);
  await page.mouse.move(x + 60, y, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator(".review-russian")).toHaveText("спасибо");
});

test("a card settles on time when frames come slowly", async ({ page }) => {
  await page.addInitScript(() => {
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => window.setTimeout(frame, 300, callback);
  });
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await page.locator(".review-card").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".review-card")).toHaveCSS("transform", "none");
});

test("a card that hides its answer springs back from a swipe", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await swipe(page, 240);
  await expect(page.locator(".review-russian")).toHaveText("перерыв на кофе");
  await expect(page.locator(".review-swedish")).toBeHidden();
});

test("the back gesture closes the review, and a finished review shows the tally", async ({ page }) => {
  await openWithLibrary(page);
  await page.getByRole("button", { name: reviewButton }).click();
  await expect(page.getByRole("dialog", { name: "Review" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Review" })).toHaveCount(0);

  await page.evaluate(() => {
    const later = Date.now() + 86_400_000 * 3;
    const graduated = { phase: "review", step: 0, interval: 3, ease: 2.5, due: later, introduced: Date.now(), remembered: 2, forgot: 0 };
    localStorage.setItem("svenska.review", JSON.stringify({
      schedules: { "fika#102": { ...graduated, remembered: 2, forgot: 3 }, "tack#103": graduated },
      days: { "2026-01-01": { remembered: 4, forgot: 3, reviewed: 2 } },
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Review Done for today" }).click();
  const review = page.getByRole("dialog", { name: "Review" });
  await expect(review.getByRole("heading", { name: "All caught up" })).toBeVisible();
  await expect(review.getByText("All reviews")).toBeVisible();
  await expect(review.locator(".review-stats dd").nth(2)).toHaveText("7");
  await expect(review.locator(".review-stats dd").nth(3)).toHaveText("57%");
  await expect(review.locator(".review-forgotten li")).toHaveText(["en fika перерыв на кофеforgot 3 of 5"]);
  await review.getByRole("button", { name: "Done" }).click();
  await expect(review).toHaveCount(0);
});
