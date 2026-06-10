import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth";
import type { Household, Role } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "hearth.household";

export type Membership = { household: Household; role: Role };

type HouseholdState = {
  memberships: Membership[];
  /** The household all queries are scoped to. */
  active: Membership | null;
  setActiveId: (id: string) => void;
  isLoading: boolean;
};

const HouseholdContext = createContext<HouseholdState | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved) setSelectedId(saved);
    });
  }, []);

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["memberships", session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("household_members")
        .select("role, household:households(*)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        role: row.role,
        household: row.household as unknown as Household,
      }));
    },
  });

  const active =
    memberships.find((m) => m.household.id === selectedId) ??
    memberships[0] ??
    null;

  const setActiveId = (id: string) => {
    setSelectedId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  return (
    <HouseholdContext.Provider
      value={{ memberships, active, setActiveId, isLoading }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext);
  if (!ctx)
    throw new Error("useHousehold must be used inside <HouseholdProvider>");
  return ctx;
}
