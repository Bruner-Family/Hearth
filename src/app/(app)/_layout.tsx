import { Redirect, Stack } from "expo-router";

import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

// Everything in this group requires a session; URLs are unaffected by the
// group so deep links like /items/<id> keep working (ADR-001 §2.1).
export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
