import type { Drop } from "@/lib/data/types";

/**
 * Drop search, shared by the demo data, the Firebase data layer and the security-rule-friendly
 * search tokens stored on each drop.
 *
 * A drop's searchable words come from its office number, company name and building name.
 * A search matches when every word typed is the start of one of those words, so
 * "vasant", "301", "301-302" and "305 shivalik" all work. Office numbers such as "301-302"
 * are also split into "301" and "302".
 */

const WORD = /[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*/gu;

/** Longest prefix stored as a search token; longer search words are cut to this for the query. */
export const MAX_TOKEN_LENGTH = 20;

function wordsOf(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const w of (text ?? "").toLowerCase().match(WORD) ?? []) {
    out.push(w);
    if (/[-/]/.test(w)) out.push(...w.split(/[-/]/).filter(Boolean));
  }
  return out;
}

/** The searchable words of a drop (office number, company name, building name). */
export function dropWords(d: Pick<Drop, "office_number" | "company_name" | "building_name">): string[] {
  return [...new Set([...wordsOf(d.office_number), ...wordsOf(d.company_name), ...wordsOf(d.building_name)])];
}

/** Words typed in a search box, lower-cased. */
export function searchTerms(q: string | null | undefined): string[] {
  return (q ?? "").toLowerCase().match(WORD) ?? [];
}

/** Every typed word must be the start of one of the drop's words. */
export function matchesDropSearch(d: Pick<Drop, "office_number" | "company_name" | "building_name">, q: string | null | undefined) {
  const terms = searchTerms(q);
  if (!terms.length) return true;
  const words = dropWords(d);
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}

/**
 * Stored on each Firestore drop as `search_tokens`: every prefix of every searchable word
 * (up to MAX_TOKEN_LENGTH characters), so one search word can be matched with `array-contains`.
 */
export function searchTokens(d: Pick<Drop, "office_number" | "company_name" | "building_name">): string[] {
  const tokens = new Set<string>();
  for (const w of dropWords(d)) {
    for (let i = 1; i <= Math.min(w.length, MAX_TOKEN_LENGTH); i++) tokens.add(w.slice(0, i));
  }
  return [...tokens];
}

/** The search word sent to Firestore: the longest one (most selective), cut to the token length. */
export function queryToken(q: string | null | undefined): string | null {
  const terms = searchTerms(q);
  if (!terms.length) return null;
  return terms.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, MAX_TOKEN_LENGTH);
}

/** Lower-case and collapse whitespace. */
export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Key used to count distinct buildings: "Shivalik  Shilp" and "shivalik shilp" are the same building. */
export function buildingKey(name: string) {
  return norm(name).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "unnamed";
}

/** Key for the city filter ("Ahmedabad " and "ahmedabad" are the same city); null when no city was entered. */
export const cityKey = (city: string | null | undefined) => (norm(city) ? buildingKey(city!) : null);

type Place = Pick<Drop, "office_number" | "company_name" | "building_name" | "city">;

/**
 * Everything stored in a Firestore drop's `search_tokens`: the search-word prefixes, plus
 * "b:<building key>" and "c:<city key>" so the building and city filters can use the same
 * array-contains index. Search words never contain ":", so the two kinds cannot collide.
 */
export function dropIndexTokens(d: Place): string[] {
  const c = cityKey(d.city);
  return [...searchTokens(d), `b:${buildingKey(d.building_name)}`, ...(c ? [`c:${c}`] : [])];
}

/** Building and city filters. A chosen building wins over the city (entries often have no city). */
export function matchesPlace(d: Pick<Drop, "building_name" | "city">, f: { building?: string; city?: string }) {
  if (f.building) return buildingKey(d.building_name) === buildingKey(f.building);
  if (f.city) return cityKey(d.city) === cityKey(f.city);
  return true;
}
