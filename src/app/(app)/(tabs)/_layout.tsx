import { Tabs } from "expo-router";
import { Text } from "react-native";

import { useHousehold } from "@/lib/household";
import { useSchedules } from "@/lib/queries";
import { dueCount } from "@/lib/schedule";
import { usePalette } from "@/lib/theme";

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
  );
}

// Bottom tabs (ADR-001 §2.6) — maps 1:1 to a native tab bar later.
export default function TabsLayout() {
  const palette = usePalette();
  const { active } = useHousehold();
  const { data: schedules = [] } = useSchedules(active?.household.id);
  const due = dueCount(schedules, new Date());
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTitleStyle: { color: palette.ink, fontWeight: "700" },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.edge,
        },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.inkDim,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon glyph="🏡" focused={focused} />,
          tabBarBadge: due > 0 ? due : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.danger,
            color: "#ffffff",
          },
        }}
      />
      <Tabs.Screen
        name="items"
        options={{
          title: "Items",
          tabBarIcon: ({ focused }) => <TabIcon glyph="📦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
