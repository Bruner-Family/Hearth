import type { Provider, Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

// Pocket-ID registered as a Supabase custom OIDC provider (ADR-001 §2.3).
// The same code path works for built-in providers and, later, the native app.
const POCKET_ID_PROVIDER = "custom:pocket-id" as Provider;

type AuthState = {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const redirectTo =
      Platform.OS === "web"
        ? window.location.origin
        : Linking.createURL("/"); // hearth:// deep link for the future native app
    const { error } = await supabase.auth.signInWithOAuth({
      provider: POCKET_ID_PROVIDER,
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
