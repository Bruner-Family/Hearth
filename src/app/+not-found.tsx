import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { View } from "react-native";

import { Button, EmptyState } from "@/components/ui";

// Custom 404. Expo's default Unmatched view renders inside <NoSSR> and never
// sets a document <title>, so the static export shipped an empty one. Giving
// this route its own <Head> means helmet emits a real title for the 404 page.
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>Page not found — Hearth</title>
      </Head>
      <View className="flex-1 items-center justify-center bg-bg p-6">
        <EmptyState
          icon="🧭"
          title="Page not found"
          body="This page doesn't exist or may have moved."
        />
        <Button title="Go home" onPress={() => router.replace("/")} />
      </View>
    </>
  );
}
