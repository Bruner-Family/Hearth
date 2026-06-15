import type { ReferenceDetail } from "@/lib/database.types";

/**
 * Normalize the form's reference-detail rows for storage: trim each field and
 * drop any row missing a label or value (so blank/half-filled rows are silently
 * discarded rather than erroring). Order is preserved.
 */
export function cleanReferenceDetails(
  pairs: ReferenceDetail[],
): ReferenceDetail[] {
  return pairs
    .map((p) => ({ label: p.label.trim(), value: p.value.trim() }))
    .filter((p) => p.label !== "" && p.value !== "");
}
