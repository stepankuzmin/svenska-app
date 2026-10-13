import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { LibrarySnapshot } from "../../src/sync/model";
const pairFragment = /pair=/;
const origin = new URL(process.env.SYNC_TEST_BASE_URL ?? "http://127.0.0.1:4173").origin;
const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
test.describe.configure({ mode: "serial" });

async function openWord(page: Page, word: string) {
  await page.getByLabel("Swedish or Russian word").fill(word);
  await page.getByRole("option").first().click();
  await expect(page.locator(".word-card-list > li").filter({ hasText: word }).first()).toBeVisible();
}
async function openSync(page: Page) {
  await page.getByRole("button", { name: "Sync devices", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function pair(first: Page, second: Page) {
  await openSync(first);
  await first.getByRole("button", { name: "Enable sync", exact: true }).click();
  await expect(first.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Connect another device", exact: true }).click();
  const link = await first.getByRole("textbox", { name: "Pairing link", exact: true }).inputValue();
  await expect(first.getByAltText("QR code to connect another device")).toBeVisible();
  await first.getByRole("button", { name: "Close sync" }).click();
  await second.goto(link);
  await expect(second.getByRole("dialog")).toBeVisible();
  await expect(second).not.toHaveURL(pairFragment);
  await second.getByRole("button", { name: "Connect this device", exact: true }).click();
  await expect(second.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Close sync" }).click();
  return link;
}

async function newDevice(context: BrowserContext) {
  const browser = context.browser()!;
  return browser.newContext({ serviceWorkers: "allow" });
}

test("paired devices sync additions, removals, ordering and offline reloads", async ({ page, context }) => {
  const secondContext = await newDevice(context);
  try {
    const second = await secondContext.newPage();
    await page.goto(".");
    await openWord(page, "katt");
    const link = await pair(page, second);
    await expect(second.locator(".word-card-list > li")).toHaveCount(1);
    const query = page.getByLabel("Swedish or Russian word");
    await query.fill("bok");
    await openWord(second, "hund");
    await expect(page.locator(".word-card-list > li")).toHaveCount(2);
    await expect(page.locator(".word-card-list > li").first()).toContainText("hund");
    await expect(query).toHaveValue("bok");
    await query.fill("");
    await second.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await secondContext.setOffline(true);
    await openWord(second, "häst");
    await expect(second.locator(".word-card-list > li")).toHaveCount(3);
    // The asynchronous local write must commit before the offline reload.
    await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem("svenska.lookup-library") ?? "[]").length)).toBe(3);
    await second.reload();
    await expect(second.locator(".word-card-list > li")).toHaveCount(3);
    await page.getByRole("button", { name: "Remove en katt from the library" }).focus();
    await page.getByRole("button", { name: "Remove en katt from the library" }).press("Enter");
    await expect(page.locator(".word-card-list > li")).toHaveCount(1);
    await secondContext.setOffline(false);
    await expect(second.locator(".word-card-list > li")).toHaveCount(2);
    await expect(page.locator(".word-card-list > li")).toHaveCount(2);
    await expect(page.locator(".word-card-list > li").first()).toContainText("häst");
    await expect(second.locator(".word-card-list > li").first()).toContainText("häst");
    await openWord(second, "katt");
    await expect(page.locator(".word-card-list > li")).toHaveCount(3);
    // A used invitation cannot connect a third device.
    const thirdContext = await newDevice(context);
    try {
      const third = await thirdContext.newPage(); await third.goto(link);
      await third.getByRole("button", { name: "Connect this device", exact: true }).click();
      await expect(third.getByRole("dialog").getByText("This pairing link has expired or was already used.", { exact: true })).toBeVisible();
    } finally { await thirdContext.close(); }
  } finally { await secondContext.close(); }
});

test("joining a spelling-only library does not restore a meaning removed on another device", async ({ page, context }) => {
  const create = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), label: "Primary", sequence: 0, words: [whale] },
  });
  const { snapshot } = await create.json() as { snapshot: LibrarySnapshot };
  const remove = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 1, baseRevision: snapshot.revision, kind: "remove", words: [whale] }] },
  });
  expect(remove.ok()).toBe(true);
  const invitation = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
  const secondContext = await newDevice(context);
  try {
    const second = await secondContext.newPage();
    await second.addInitScript(() => {
      if (!sessionStorage.getItem("legacy-seeded")) {
        localStorage.setItem("svenska.lookup-library", JSON.stringify(["val"]));
        sessionStorage.setItem("legacy-seeded", "yes");
      }
    });
    await second.goto(`${origin}/#pair=${invitation.libraryId}.${invitation.token}`);
    await second.getByRole("button", { name: "Connect this device", exact: true }).click();
    await expect(second.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Close sync" }).click();
    await expect(second.locator(".word-card-list > li")).toHaveCount(1);
    await expect(second.locator(".word-card-list > li")).toContainText("ett val");
    const shared = await (await page.request.get("/api/sync/library")).json() as LibrarySnapshot;
    expect(shared.records.find((record) => record.word === whale.word)?.present).toBe(false);
    expect(shared.records.find((record) => record.word === election.word)?.present).toBe(true);
    expect(shared.records.some((record) => record.word === "")).toBe(false);
  } finally { await secondContext.close(); }
});

test("a second tab saves offline changes and shares the durable queue", async ({ page, context }) => {
  await page.goto(".");
  await openSync(page);
  await page.getByRole("button", { name: "Enable sync", exact: true }).click();
  await expect(page.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close sync" }).click();
  const second = await context.newPage(); await second.goto(".");
  await context.setOffline(true);
  await openWord(page, "katt");
  await openWord(second, "hund");
  await expect(page.locator(".word-card-list > li")).toHaveCount(2);
  await expect(second.locator(".word-card-list > li")).toHaveCount(2);
  await context.setOffline(false);
  await openSync(page);
  await expect(page.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
  const snapshot = await (await page.request.get("/api/sync/library")).json() as LibrarySnapshot;
  expect(snapshot.acknowledged).toBe(2);
  expect(snapshot.records.filter((record) => record.present)).toHaveLength(2);
});

test("the persistent service deduplicates requests and enforces pairing, conflicts and revocation", async ({ context }) => {
  const create = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), label: "Phone", sequence: 0, words: [whale, election] },
  });
  expect(create.ok()).toBe(true);
  const { snapshot, recoveryCode } = await create.json() as { snapshot: LibrarySnapshot; recoveryCode: string };
  const invitation = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
  const secondContext = await newDevice(context);
  try {
    const secondId = randomUUID();
    const join = await secondContext.request.post(`${origin}/api/sync/join`, {
      headers: { Origin: origin }, data: { ...invitation, deviceId: secondId, label: "Computer", sequence: 0, words: [] },
    });
    expect(join.ok()).toBe(true);
    const operation = { sequence: 1, baseRevision: snapshot.revision, kind: "remove", words: [whale] };
    const send = () => context.request.post("/api/sync/operations", { headers: { Origin: origin }, data: { operations: [operation] } });
    const first = await (await send()).json() as LibrarySnapshot;
    const duplicate = await (await send()).json() as LibrarySnapshot;
    expect(duplicate.revision).toBe(first.revision);
    expect(duplicate.acknowledged).toBe(1);
    const stale = await secondContext.request.post(`${origin}/api/sync/operations`, {
      headers: { Origin: origin }, data: { operations: [{ ...operation, kind: "open" }] },
    });
    const staleSnapshot = await stale.json() as LibrarySnapshot;
    expect(staleSnapshot.records.find((record) => record.word === whale.word)?.present).toBe(false);
    const reopen = await secondContext.request.post(`${origin}/api/sync/operations`, {
      headers: { Origin: origin }, data: { operations: [{ ...operation, sequence: 2, kind: "open", baseRevision: staleSnapshot.revision }] },
    });
    expect((await reopen.json() as LibrarySnapshot).records.find((record) => record.word === whale.word)?.present).toBe(true);
    const gap = await context.request.post("/api/sync/operations", {
      headers: { Origin: origin }, data: { operations: [{ ...operation, sequence: 4 }] },
    });
    expect(gap.status()).toBe(409);
    const crossOrigin = await context.request.post("/api/sync/invitations", { headers: { Origin: "https://other.example" }, data: {} });
    expect(crossOrigin.status()).toBe(403);
    const revoke = await context.request.delete(`/api/sync/devices/${secondId}`, { headers: { Origin: origin } });
    expect(revoke.ok()).toBe(true);
    expect((await secondContext.request.get(`${origin}/api/sync/library`)).status()).toBe(401);
    const [libraryId, token] = recoveryCode.split(".");
    const recovered = await secondContext.request.post(`${origin}/api/sync/recover`, {
      headers: { Origin: origin }, data: { libraryId, token, deviceId: randomUUID(), label: "Recovered", sequence: 0, words: [] },
    });
    expect(recovered.ok()).toBe(true);
    expect((await recovered.json() as { snapshot: LibrarySnapshot }).snapshot.records.filter((record) => record.present)).toHaveLength(2);
  } finally { await secondContext.close(); }
});
