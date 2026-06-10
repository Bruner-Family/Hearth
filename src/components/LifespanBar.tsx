import { View } from "react-native";

import { lifespanBand } from "@/lib/lifespan";

/**
 * Proportional remaining-life bar (ADR-001 §2.5) — a styled rectangle that
 * works identically on web and native.
 */
export function LifespanBar({
  ratio,
  height = 8,
}: {
  /** age / effective lifespan; values > 1 render as a full red bar. */
  ratio: number;
  height?: number;
}) {
  const band = lifespanBand(ratio);
  const fill = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[band];
  const pct = Math.max(2, Math.min(100, ratio * 100));
  return (
    <View
      className="w-full overflow-hidden rounded-full bg-edge"
      style={{ height }}
    >
      <View className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </View>
  );
}
