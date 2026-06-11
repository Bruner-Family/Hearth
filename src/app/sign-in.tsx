import { Redirect } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, ErrorNote, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useDemo } from "@/lib/demo";

export default function SignInScreen() {
  const { session, loading, signIn } = useAuth();
  const { enabled: demo, enter: enterDemo } = useDemo();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (session || demo) return <Redirect href="/" />;

  const handleSignIn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
    // On web the browser navigates away to Pocket-ID; leave busy=true.
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="mb-2 text-6xl">🏡</Text>
        <Text className="mb-1 text-3xl font-bold text-ink">Hearth</Text>
        <Text className="mb-10 text-center text-base text-ink-dim">
          The household&rsquo;s asset &amp; maintenance log
        </Text>
        {error ? <ErrorNote message={error} /> : null}
        <View className="w-full max-w-sm">
          <Button
            title="Sign in with Pocket-ID"
            loading={busy}
            onPress={handleSignIn}
          />
          <View className="mt-3">
            <Button
              title="Explore the demo"
              variant="secondary"
              onPress={() => enterDemo()}
            />
          </View>
        </View>
        <Text className="mt-6 text-center text-xs text-ink-dim">
          Access is by household invitation only — or poke around the demo
          home with example data.
        </Text>
      </View>
    </SafeAreaView>
  );
}
