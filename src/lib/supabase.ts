import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Database } from "@/lib/database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — see .env.example",
  );
}

// The publishable key is safe to ship in a static bundle: RLS is the
// enforcement boundary (ADR-001 §2.3/§2.4).
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    // On web the default localStorage adapter also handles the OAuth
    // redirect callback; native needs AsyncStorage and no URL detection.
    ...(Platform.OS !== "web"
      ? { storage: AsyncStorage, detectSessionInUrl: false }
      : { detectSessionInUrl: true }),
  },
});
