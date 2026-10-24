import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { receiveSnapshot, visibleWords, type LibrarySnapshot } from "../../src/sync/model";
const pairFragment = /pair=/;
const origin = new URL(process.env.SYNC_TEST_BASE_URL ?? "http://127.0.0.1:4173").origin;
const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const challenge = "XXXX.DUMMY.TOKEN.XXXX";
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

test("sync starts when another module script loads first, and reads renew the device cookie", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive" || document.querySelector("script[data-extension]")) return;
      const script = document.createElement("script");
      script.type = "module"; script.src = "data:text/javascript,void 0"; script.dataset.extension = "";
      document.head.prepend(script);
    });
  });
  await page.goto(".");
  await openSync(page);
  await page.getByRole("button", { name: "Enable sync", exact: true }).click();
  await expect(page.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
  const revision = await page.request.get("api/sync/revision");
  expect(revision.headers()["set-cookie"]).toContain("Max-Age=31536000");
});

test("a tab opened before pairing keeps receiving changes after the pairing tab closes", async ({ page, context }) => {
  const otherContext = await newDevice(context);
  try {
    await page.goto(".");
    const existing = await context.newPage(); await existing.goto(".");
    await expect(existing.getByRole("status")).toBeEmpty();
    const other = await otherContext.newPage();
    await pair(page, other);
    await page.close();
    await openWord(other, "hund");
    await expect(existing.locator(".word-card-list > li")).toHaveCount(1);
    await expect(existing.locator(".word-card-list > li")).toContainText("hund");
  } finally { await otherContext.close(); }
});

test("simultaneous connection attempts in two tabs create only one shared library", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(".");
    const second = await context.newPage(); await second.goto(".");
    await openSync(page); await openSync(second);
    await expect(page.getByRole("button", { name: "Enable sync", exact: true })).toBeEnabled();
    await expect(second.getByRole("button", { name: "Enable sync", exact: true })).toBeEnabled();
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requests = 0;
    await context.route("**/api/sync/libraries", async (route) => {
      requests++; await gate; await route.continue();
    });
    await Promise.all([page, second].map((tab) => tab.getByRole("button", { name: "Enable sync", exact: true }).evaluate((button: HTMLButtonElement) => button.click())));
    release();
    await expect(page.getByRole("button", { name: "Connect another device", exact: true })).toBeVisible();
    await expect(second.getByRole("button", { name: "Connect another device", exact: true })).toBeVisible();
    expect(requests).toBe(1);
    await page.getByRole("button", { name: "Close sync" }).click();
    await second.getByRole("button", { name: "Close sync" }).click();
    await openWord(second, "katt");
    await expect(page.locator(".word-card-list > li")).toHaveCount(1);
    await expect.poll(async () => {
      const response = await page.request.get("/api/sync/library");
      expect(response.ok()).toBe(true);
      return (await response.json() as LibrarySnapshot).records.filter((record) => record.present).length;
    }).toBe(1);
  } finally { await context.close(); }
});

test("creating a library requires the person check", async ({ context }) => {
  const create = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), label: "Script", sequence: 0, words: [whale] },
  });
  expect(create.status()).toBe(403);
});

test("recovery or a fresh invitation replaces a credential stranded by a lost connection response", async ({ context }) => {
  const create = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "Primary", sequence: 0, words: [whale] },
  });
  const { recoveryCode } = await create.json() as { recoveryCode: string };
  const invitation = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
  const secondContext = await newDevice(context);
  try {
    const deviceId = randomUUID();
    const details = { deviceId, challenge, label: "Returning", sequence: 0, words: [] };
    const joined = await secondContext.request.post(`${origin}/api/sync/join`, { headers: { Origin: origin }, data: { ...invitation, ...details } });
    expect(joined.ok()).toBe(true);
    const first = (await joined.json() as { snapshot: LibrarySnapshot }).snapshot;
    const saved = await secondContext.request.post(`${origin}/api/sync/operations`, {
      headers: { Origin: origin }, data: { operations: [{ sequence: 1, baseRevision: first.revision, kind: "open", words: [election] }] },
    });
    expect(saved.ok()).toBe(true);
    await secondContext.clearCookies();
    const fresh = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
    const pendingRemoval = { sequence: 2, baseRevision: 0, kind: "remove" as const, words: [whale] };
    const retried = await secondContext.request.post(`${origin}/api/sync/join`, { headers: { Origin: origin }, data: { ...fresh, ...details, sequence: 2 } });
    expect(retried.ok()).toBe(true);
    const retriedSnapshot = (await retried.json() as { snapshot: LibrarySnapshot }).snapshot;
    expect(retriedSnapshot.acknowledged).toBe(1);
    const replay = receiveSnapshot({ snapshot: { ...first, libraryId: "" }, sequence: 2, pending: [pendingRemoval] }, retriedSnapshot);
    expect(replay.pending).toEqual([pendingRemoval]);
    expect(visibleWords(replay)).toEqual([election]);
    const removed = await secondContext.request.post(`${origin}/api/sync/operations`, { headers: { Origin: origin }, data: { operations: replay.pending } });
    expect(removed.ok()).toBe(true);
    await secondContext.clearCookies();
    const [libraryId, token] = recoveryCode.split(".");
    const recovered = await secondContext.request.post(`${origin}/api/sync/recover`, { headers: { Origin: origin }, data: { ...details, sequence: 3, libraryId, token } });
    expect(recovered.ok()).toBe(true);
    const recoveredSnapshot = (await recovered.json() as { snapshot: LibrarySnapshot }).snapshot;
    expect(recoveredSnapshot.acknowledged).toBe(2);
    const removeElection = await secondContext.request.post(`${origin}/api/sync/operations`, {
      headers: { Origin: origin }, data: { operations: [{ ...pendingRemoval, sequence: 3, words: [election] }] },
    });
    expect(removeElection.ok()).toBe(true);
    expect((await removeElection.json() as LibrarySnapshot).records.filter((record) => record.present)).toHaveLength(0);
    expect((await (await context.request.get("/api/sync/devices")).json() as { id: string }[]).filter((device) => device.id === deviceId)).toHaveLength(1);
  } finally { await secondContext.close(); }
});

test("a full 20000-word library persists beyond SQLite's per-row size limit", async ({ context }) => {
  const words = Array.from({ length: 20_000 }, (_, index) => ({ headword: `word-${index}`, word: String(index + 1) }));
  const create = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "Large library", sequence: 0, words },
  });
  expect(create.ok()).toBe(true);
  const { snapshot } = await create.json() as { snapshot: LibrarySnapshot };
  expect(snapshot.records).toHaveLength(20_000);
  expect(JSON.stringify(snapshot.records).length).toBeGreaterThan(2 * 1024 * 1024);
  const revision = await context.request.get("/api/sync/revision");
  expect(revision.ok()).toBe(true);
  expect(await revision.json()).toEqual({ protocol: 2, revision: snapshot.revision, acknowledged: snapshot.acknowledged });
  expect((await revision.body()).byteLength).toBeLessThan(100);
  const remove = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 1, baseRevision: snapshot.revision, kind: "remove", words: [words[0]] }] },
  });
  expect(remove.ok()).toBe(true);
  const read = await context.request.get("/api/sync/library");
  expect(read.ok()).toBe(true);
  expect((await read.json() as LibrarySnapshot).records.filter((record) => record.present)).toHaveLength(19_999);
  const replacement = { headword: "replacement", word: "30000" };
  const opened = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 2, baseRevision: snapshot.revision + 1, kind: "open", words: [replacement] }] },
  });
  expect(opened.ok()).toBe(true);
  const full = await opened.json() as LibrarySnapshot;
  expect(full.records.filter((record) => record.present)).toHaveLength(20_000);
  expect(full.records).toHaveLength(20_001);
  const another = { headword: "another", word: "30001" };
  const overflow = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 3, baseRevision: full.revision, kind: "open", words: [another] }] },
  });
  expect(overflow.ok()).toBe(true);
  const rejected = await overflow.json() as LibrarySnapshot;
  expect(rejected.acknowledged).toBe(3);
  expect(rejected.revision).toBe(full.revision);
  expect(rejected.rejectedOperation).toMatchObject({ sequence: 3, message: expect.stringContaining("library is full") });
  expect(rejected.records.filter((record) => record.present)).toHaveLength(20_000);
  const removals = Array.from({ length: 20 }, (_, index) => ({
    sequence: index + 4, baseRevision: full.revision, kind: "remove", words: words.slice(1 + index * 1000, 1 + (index + 1) * 1000),
  }));
  const cleared = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: removals },
  });
  expect(cleared.ok()).toBe(true);
  const history = await cleared.json() as LibrarySnapshot;
  expect(history.records.filter((record) => !record.present)).toHaveLength(20_000);
  expect(history.records.filter((record) => record.present)).toHaveLength(1);
  const historyOverflow = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 24, baseRevision: history.revision, kind: "remove", words: [replacement] }] },
  });
  expect(historyOverflow.status()).toBe(422);
  expect(await historyOverflow.json()).toMatchObject({ error: expect.stringContaining("removal history is full") });
  const newWord = await context.request.post("/api/sync/operations", {
    headers: { Origin: origin }, data: { operations: [{ sequence: 24, baseRevision: history.revision, kind: "open", words: [another] }] },
  });
  expect(newWord.ok()).toBe(true);
  const current = await newWord.json() as LibrarySnapshot;
  expect(current.records.filter((record) => record.present)).toHaveLength(2);
  expect(current.records.filter((record) => !record.present)).toHaveLength(20_000);
});

test("concurrent openings at capacity reject one operation without blocking later edits", async ({ context }) => {
  const words = Array.from({ length: 19_999 }, (_, index) => ({ headword: `word-${index}`, word: String(index + 1) }));
  const created = await context.request.post("/api/sync/libraries", {
    headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "First", sequence: 0, words },
  });
  expect(created.ok()).toBe(true);
  const first = (await created.json() as { snapshot: LibrarySnapshot }).snapshot;
  const invitation = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
  const other = await newDevice(context);
  try {
    const joined = await other.request.post(`${origin}/api/sync/join`, {
      headers: { Origin: origin }, data: { ...invitation, deviceId: randomUUID(), challenge, label: "Second", sequence: 0, words: [] },
    });
    expect(joined.ok()).toBe(true);
    const second = (await joined.json() as { snapshot: LibrarySnapshot }).snapshot;
    expect(second.records).toHaveLength(19_999);
    const winner = { headword: "winner", word: "30000" };
    const loser = { headword: "loser", word: "30001" };
    const accepted = await context.request.post("/api/sync/operations", {
      headers: { Origin: origin }, data: { operations: [{ sequence: 1, baseRevision: first.revision, kind: "open", words: [winner] }] },
    });
    expect(accepted.ok()).toBe(true);
    const opening = { sequence: 1, baseRevision: second.revision, kind: "open", words: [loser] };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await other.request.post(`${origin}/api/sync/operations`, {
        headers: { Origin: origin }, data: { operations: [opening] },
      });
      expect(response.ok()).toBe(true);
      const rejected = await response.json() as LibrarySnapshot;
      expect(rejected.acknowledged).toBe(1);
      expect(rejected.rejectedOperation).toMatchObject({ sequence: 1 });
      expect(rejected.records).not.toContainEqual(expect.objectContaining(loser));
    }
    const recovered = await other.request.get(`${origin}/api/sync/library`);
    const current = await recovered.json() as LibrarySnapshot;
    expect(current.rejectedOperation).toMatchObject({ sequence: 1 });
    const replacement = await other.request.post(`${origin}/api/sync/operations`, {
      headers: { Origin: origin }, data: { operations: [
        { sequence: 2, baseRevision: current.revision, kind: "remove", words: [words[0]] },
        { sequence: 3, baseRevision: current.revision, kind: "open", words: [loser] },
      ] },
    });
    expect(replacement.ok()).toBe(true);
    const result = await replacement.json() as LibrarySnapshot;
    expect(result.acknowledged).toBe(3);
    expect(result.rejectedOperation).toBeUndefined();
    expect(result.records.filter((record) => record.present)).toHaveLength(20_000);
    expect(result.records).toContainEqual(expect.objectContaining({ ...winner, present: true }));
    expect(result.records).toContainEqual(expect.objectContaining({ ...loser, present: true }));
  } finally { await other.close(); }
});

test("a failed transport download retries and receives remote edits without reloading", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
  try {
    const create = await context.request.post("/api/sync/libraries", {
      headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "Retrying", sequence: 0, words: [whale] },
    });
    expect(create.ok()).toBe(true);
    const { snapshot } = await create.json() as { snapshot: LibrarySnapshot };
    const page = await context.newPage();
    await page.route(`${origin}/`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" }));
    await page.goto(".");
    await page.evaluate((snapshot) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("svenska-library", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("library");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("library", "readwrite");
        transaction.objectStore("library").put({ snapshot, sequence: snapshot.acknowledged, pending: [] }, "current");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    }), snapshot);
    await page.unroute(`${origin}/`);
    let attempts = 0;
    await page.route("**/assets/remote-*.js*", (route) => ++attempts <= 2 ? route.abort("internetdisconnected") : route.continue());
    await page.clock.install();
    const [socket] = await Promise.all([
      page.waitForEvent("websocket"),
      page.reload().then(() => expect.poll(async () => {
        await page.clock.fastForward(1000);
        return attempts;
      }).toBe(3)),
    ]);
    const notified = socket.waitForEvent("framereceived");
    const change = await context.request.post("/api/sync/operations", {
      headers: { Origin: origin }, data: { operations: [{ sequence: 1, baseRevision: snapshot.revision, kind: "open", words: [election] }] },
    });
    expect(change.ok()).toBe(true);
    await notified;
    await expect(page.locator(".word-card-list > li")).toHaveCount(2);
    await expect(page.locator(".word-card-list > li")).toContainText(["ett val", "en val"]);
    await openSync(page);
    await page.getByRole("button", { name: "Connect another device", exact: true }).click();
    await expect(page.getByAltText("QR code to connect another device")).toBeVisible();
    await page.getByText("Recovery", { exact: true }).click();
    await page.getByRole("button", { name: "Generate recovery code", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Recovery code", exact: true })).toBeVisible();
    const [libraryId, token] = (await page.getByRole("textbox", { name: "Recovery code", exact: true }).inputValue()).split(".");
    const superseded = socket.waitForEvent("close");
    const replacement = await context.request.post("/api/sync/recover", {
      headers: { Origin: origin }, data: { libraryId, token, deviceId: snapshot.deviceId, challenge, label: "Reconnected tab", sequence: 1, words: [] },
    });
    expect(replacement.ok()).toBe(true);
    await superseded;
    await expect(page.getByText("This device is disconnected. Your local words are kept.", { exact: true })).toBeVisible();
    const replacementSnapshot = (await replacement.json() as { snapshot: LibrarySnapshot }).snapshot;
    await page.evaluate((snapshot) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("svenska-library", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("library", "readwrite");
        const current = transaction.objectStore("library").get("current");
        current.onsuccess = () => transaction.objectStore("library").put({ ...current.result, snapshot }, "current");
        transaction.oncomplete = () => {
          database.close();
          const channel = new BroadcastChannel("svenska-library-changes"); channel.postMessage("changed"); channel.close(); resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    }), replacementSnapshot);
    await expect(page.getByText("Your devices are in sync.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect this device", exact: true }).click();
    await expect(page.getByRole("button", { name: "Enable sync", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close sync", exact: true }).click();
    await expect(page.locator(".word-card-list > li")).toHaveCount(2);
  } finally { await context.close(); }
});

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
    headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "Primary", sequence: 0, words: [whale] },
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
  await expect(second.getByRole("status")).toBeEmpty();
  await second.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
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
    headers: { Origin: origin }, data: { deviceId: randomUUID(), challenge, label: "Phone", sequence: 0, words: [whale, election] },
  });
  expect(create.ok()).toBe(true);
  const { snapshot, recoveryCode } = await create.json() as { snapshot: LibrarySnapshot; recoveryCode: string };
  const invitation = await (await context.request.post("/api/sync/invitations", { headers: { Origin: origin }, data: {} })).json();
  const secondContext = await newDevice(context);
  try {
    const secondId = randomUUID();
    const join = await secondContext.request.post(`${origin}/api/sync/join`, {
      headers: { Origin: origin }, data: { ...invitation, deviceId: secondId, challenge, label: "Computer", sequence: 0, words: [] },
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
      headers: { Origin: origin }, data: { libraryId, token, deviceId: randomUUID(), challenge, label: "Recovered", sequence: 0, words: [] },
    });
    expect(recovered.ok()).toBe(true);
    expect((await recovered.json() as { snapshot: LibrarySnapshot }).snapshot.records.filter((record) => record.present)).toHaveLength(2);
  } finally { await secondContext.close(); }
});
