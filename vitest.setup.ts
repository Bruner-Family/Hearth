// Global test setup. Required because some unit tests import modules
// (e.g. `@/lib/demo`) that transitively import `@/lib/supabase`, which reads
// EXPO_PUBLIC_SUPABASE_* env vars at module-load time (throwing if absent) and
// imports react-native / async-storage. Env vars must be set and native
// modules mocked BEFORE those imports evaluate — only a setupFile can do that.

import { vi } from "vitest";

// Define globals needed for expo modules
(globalThis as any).__DEV__ = false;

// Set up environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-key";

// Mock react-native modules
vi.mock("react-native", () => ({
  default: {},
  Platform: { OS: "native" },
  AppState: { addEventListener: vi.fn() },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("expo-modules-core", () => ({
  EventEmitter: class EventEmitter {},
  requireNativeModule: vi.fn(),
}));

vi.mock("expo-linking", () => ({
  default: {},
}));
