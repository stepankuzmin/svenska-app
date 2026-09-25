import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type DiffLine = { file: string; line: number; text: string };

export type Diff = {
  mergeBase: string;
  added: DiffLine[];
  removed: DiffLine[];
  deletedFiles: string[];
};

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// Exits 2 on failure, so a diff that could not be read never reads as no changes.
function gitOrExit(args: string[]): string {
  const output = git(args);
  if (output === null) {
    console.error(`constraints: git ${args.join(" ")} failed`);
    process.exit(2);
  }
  return output;
}

// Base ref: `--base <ref>`, then CONSTRAINTS_BASE, then origin/main.
function baseRef(): string {
  const flag = process.argv.indexOf("--base");
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  return process.env.CONSTRAINTS_BASE ?? "origin/main";
}

// Exits 2 when there is no merge base, so a guard that could not run never reads as clean.
export function readDiff(): Diff {
  const base = baseRef();
  const mergeBase = git(["merge-base", base, "HEAD"])?.trim();
  if (!mergeBase) {
    console.error(`constraints: no merge base against ${base}; fetch it or pass --base <ref>`);
    process.exit(2);
  }

  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let file = "";
  let oldLine = 0;
  let newLine = 0;
  // Working tree against the merge base: committed, staged and unstaged changes.
  // A configured external diff tool or textconv would replace the unified diff this parses.
  for (const text of gitOrExit(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=0", mergeBase, "--"]).split("\n")) {
    if (text.startsWith("--- ")) {
      file = text.slice(6);
    } else if (text.startsWith("+++ ")) {
      if (text !== "+++ /dev/null") file = text.slice(6);
    } else if (text.startsWith("@@")) {
      const match = hunkHeader.exec(text);
      oldLine = Number(match?.[1]);
      newLine = Number(match?.[2]);
    } else if (text.startsWith("+")) {
      added.push({ file, line: newLine++, text: text.slice(1) });
    } else if (text.startsWith("-")) {
      removed.push({ file, line: oldLine++, text: text.slice(1) });
    }
  }

  // `git diff` cannot see files that were never added.
  const untracked = gitOrExit(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  for (const path of untracked) {
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((text, index) => added.push({ file: path, line: index + 1, text }));
  }

  const deletedFiles = gitOrExit(["diff", "--name-only", "--diff-filter=D", mergeBase, "--"])
    .split("\n")
    .filter(Boolean);

  return { mergeBase, added, removed, deletedFiles };
}

// A file's content at the merge base, or null when it did not exist there.
export function fileAtBase(mergeBase: string, path: string): string | null {
  return git(["show", `${mergeBase}:${path}`]);
}
