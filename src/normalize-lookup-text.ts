export function cleanLexinText(value: string): string {
  return value.replaceAll("|", "");
}

export function normalizeLookupText(value: string): string {
  return value.trim().toLocaleLowerCase("sv-SE");
}

export function normalizeSwedishLookupText(value: string): string {
  return normalizeLookupText(cleanLexinText(value));
}
