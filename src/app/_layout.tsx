import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

import { AuthProvider } from "@/lib/auth";
import { DemoProvider } from "@/lib/demo";
import { HouseholdProvider } from "@/lib/household";
import { ThemeProvider, useTheme } from "@/lib/theme";

import "../global.css";

function RootStack() {
  const { scheme } = useTheme();
  return (
    <>
      <Head>
        <title>Hearth — home asset & maintenance tracker</title>
      </Head>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <DemoProvider>
            <HouseholdProvider>
              <RootStack />
            </HouseholdProvider>
          </DemoProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
