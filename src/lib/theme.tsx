import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nativewindColorScheme } from "nativewind";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

const STORAGE_KEY = "hearth.theme";

export type ThemePreference = "system" | "light" | "dark";

type ThemeState = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Resolved scheme after applying the preference. */
  scheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeState | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme: "light" | "dark" =
    useSystemColorScheme() === "dark" ? "dark" : "light";
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Dark/light follows the system preference with a manual override persisted
  // in AsyncStorage (localStorage on web) — ADR-001 §2.6.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPreferenceState(saved);
      }
    });
  }, []);

  const scheme = preference === "system" ? systemScheme : preference;

  // With darkMode:'class', NativeWind toggles the `.dark` class only for an
  // explicit light/dark value (a "system" value never applies it), so resolve
  // the system preference ourselves and always set a concrete scheme.
  useEffect(() => {
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ preference, setPreference, scheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

// Raw color values for places NativeWind classes can't reach (SVG fills,
// navigator chrome). Mirrors the CSS variables in src/global.css.
export type Palette = {
  bg: string;
  card: string;
  edge: string;
  ink: string;
  inkDim: string;
  accent: string;
  onAccent: string;
  ok: string;
  warn: string;
  danger: string;
};

const palettes: Record<"light" | "dark", Palette> = {
  light: {
    bg: "#FAF7F2",
    card: "#FFFFFF",
    edge: "#E7E1D8",
    ink: "#1C1917",
    inkDim: "#78716C",
    accent: "#C2410C",
    onAccent: "#FFFBF7",
    ok: "#16A34A",
    warn: "#D97706",
    danger: "#DC2626",
  },
  dark: {
    bg: "#131110",
    card: "#201D1B",
    edge: "#36312D",
    ink: "#F5F0EA",
    inkDim: "#A8A29E",
    accent: "#FB923C",
    onAccent: "#21140A",
    ok: "#4ADE80",
    warn: "#FBBF24",
    danger: "#F87171",
  },
};

export function usePalette(): Palette {
  return palettes[useTheme().scheme];
}
