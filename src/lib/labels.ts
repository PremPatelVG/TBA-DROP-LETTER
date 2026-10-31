import type { OpsScopeType } from "@/lib/data/types";

/**
 * Display labels for a regional (operations) account's scope, shared by the admin UI and the demo sign-in list.
 * "President" is the client's term for a regional head; national accounts are "TBA India Ops".
 */

/** The account's scope, kept visible everywhere: national ⇒ all regions; state/city ⇒ the named region. */
export function scopeLabel(scope_type: OpsScopeType | null, scope_value: string | null): string {
  if (scope_type === "national") return "National · all regions";
  if (scope_type === "state" && scope_value) return `State: ${scope_value}`;
  if (scope_type === "city" && scope_value) return `City: ${scope_value}`;
  return "—";
}

/** The account's title: national ⇒ "TBA India Ops"; state/city ⇒ "<Region> President" (e.g. "Gujarat President"). */
export function regionalTitle(scope_type: OpsScopeType | null, scope_value: string | null): string {
  if (scope_type === "national") return "TBA India Ops";
  if ((scope_type === "state" || scope_type === "city") && scope_value) return `${scope_value} President`;
  return "Regional account";
}

/** How a response status reads in filters, tables and the Excel export. */
export const RESPONSE_STATUS_LABEL: Record<"pending" | "responded" | "not_interested", string> = {
  pending: "No response yet",
  responded: "Responded",
  not_interested: "Not interested",
};
