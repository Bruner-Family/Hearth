import { Text, View } from "react-native";

import { Card, SectionTitle } from "@/components/ui";
import type { ReferenceDetail } from "@/lib/database.types";

export function ReferenceDetailsCard({
  details,
}: {
  details: ReferenceDetail[];
}) {
  return (
    <View>
      <SectionTitle>Reference</SectionTitle>
      <Card className="mb-4">
        {details.map((pair, i) => (
          <View
            key={`${pair.label}-${i}`}
            className={`flex-row justify-between py-2 ${
              i > 0 ? "border-t border-edge" : ""
            }`}
          >
            <Text className="text-sm text-ink-dim">{pair.label}</Text>
            <Text className="ml-4 flex-1 text-right text-sm text-ink">
              {pair.value}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}
