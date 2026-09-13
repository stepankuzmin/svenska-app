import { expect, test, type Page } from "@playwright/test";

async function searchFor(page: Page, query: string) {
  const field = page.getByLabel("Swedish or Russian word");
  await field.fill(query);
  await field.press("Enter");
}

test("registers the service worker before load so deployed updates can refresh stale clients", async ({ page }) => {
  await page.addInitScript(`
    const serviceWorker = navigator.serviceWorker;
    const register = serviceWorker.register.bind(serviceWorker);

    Object.defineProperty(serviceWorker, "register", {
      configurable: true,
      value(...args) {
        Reflect.set(globalThis, "serviceWorkerRegistrationReadyState", document.readyState);
        return register(...args);
      },
    });
  `);

  await page.goto(".");

  await expect.poll(() => page.evaluate("Reflect.get(globalThis, 'serviceWorkerRegistrationReadyState')"))
    .toBe("interactive");
});

test("reloads for a later worker update after ignoring the first installation claim", async ({ page }) => {
  await page.addInitScript(`
    const serviceWorker = navigator.serviceWorker;

    Object.defineProperty(serviceWorker, "controller", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(serviceWorker, "register", {
      configurable: true,
      value: () => Promise.resolve(undefined),
    });

    const loadCount = Number(sessionStorage.getItem("pwaUpdateLoadCount") ?? "0") + 1;
    sessionStorage.setItem("pwaUpdateLoadCount", String(loadCount));
  `);

  await page.goto(".");
  await page.evaluate("navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))");
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate("Number(sessionStorage.getItem('pwaUpdateLoadCount'))"))
    .toBe(1);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.evaluate("navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))"),
  ]);
  await expect.poll(() => page.evaluate("Number(sessionStorage.getItem('pwaUpdateLoadCount'))"))
    .toBe(2);
});

test("lookup remains available after an online visit and offline reload", async ({ context, page }) => {
  await page.goto(".");
  await expect(page.getByRole("status")).toBeEmpty();

  await page.waitForFunction("navigator.serviceWorker?.controller !== null");

  await context.setOffline(true);
  await page.evaluate("location.reload()");
  await expect(page.getByRole("status")).toBeEmpty();

  await searchFor(page, "bok");
  await expect(page.getByRole("region", { name: "Library" }).getByRole("strong").filter({ hasText: /^bok$/ })).toBeVisible();

  const field = page.getByLabel("Swedish or Russian word");
  await field.fill("bokst");
  await expect(page.getByRole("listbox")).toBeVisible();
  await field.fill("definitely-not-a-swedish-word");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a first offline visit explains that one connection is required", async ({ context, page }) => {
  await page.route("**/lexin-dictionary.*.json", async (route) => {
    await context.setOffline(true);
    await route.abort("internetdisconnected");
  });

  await page.goto(".");

  await expect(page.getByRole("status")).toHaveText(/connect once/i);
  await expect(page.getByLabel("Swedish or Russian word")).toBeFocused();
});
