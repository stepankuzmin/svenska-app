import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const reportDirectory = process.env.BROWSER_CRASH_REPORT_DIR
  ?? join(homedir(), "Library/Logs/DiagnosticReports");
const browserReport = /^(?:chrome-headless-shell|Google Chrome(?: Helper)?|Playwright)-.*\.(?:ips|crash)$/i;

function crashReports() {
  if (!existsSync(reportDirectory)) return new Map();
  return new Map(readdirSync(reportDirectory)
    .filter((name) => browserReport.test(name))
    .map((name) => [name, statSync(join(reportDirectory, name)).mtimeMs]));
}

const before = crashReports();
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
let result = build;
if (build.status === 0) {
  result = spawnSync(join("node_modules", ".bin", "playwright"), ["test"], {
    stdio: "inherit",
  });
}

// macOS can finish writing a crash report just after the browser exits.
await new Promise((resolve) => setTimeout(resolve, 2000));
const crashed = [...crashReports()].filter(([name, modified]) =>
  modified > (before.get(name) ?? 0));
if (crashed.length > 0) {
  console.error("Browser process crash reports appeared during the test run:");
  for (const [name] of crashed) console.error(`  ${join(reportDirectory, name)}`);
}

process.exitCode = result.status === 0 && crashed.length === 0 ? 0 : 1;
