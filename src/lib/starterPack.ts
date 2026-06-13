// Seasonal starter pack (roadmap spec v1.2): house-level tasks offered once
// per household, adopt-or-skip each. Pure data — the card does the writes.

export type StarterTask = {
  name: string;
  interval_months: number | null;
  anchor_month: number | null;
};

export const STARTER_PACK: StarterTask[] = [
  { name: "Clean gutters", interval_months: null, anchor_month: 11 },
  { name: "Irrigation blow-out", interval_months: null, anchor_month: 10 },
  { name: "Replace HVAC filters", interval_months: 3, anchor_month: null },
  { name: "Test smoke detector batteries", interval_months: 6, anchor_month: null },
];

/** AsyncStorage flag: the household has seen the pack (adopted or skipped). */
export function starterPackDismissedKey(householdId: string): string {
  return `hearth.starter-pack-dismissed.${householdId}`;
}
