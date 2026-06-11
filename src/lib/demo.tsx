import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth";
import type {
  Database,
  Household,
  HouseholdMember,
  ItemCategory,
  ItemWithCategory,
  MaintenanceLog,
  Role,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "hearth.demo";

// ---------------------------------------------------------------------------
// Demo mode: a signed-out, share-with-friends tour of the app backed by the
// in-memory store below instead of Supabase. Edits work but live only until
// the demo is re-entered or exited; nothing ever leaves the device.
// ---------------------------------------------------------------------------

type DemoState = {
  enabled: boolean;
  enter: () => void;
  exit: () => void;
};

const DemoContext = createContext<DemoState | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [flag, setFlag] = useState(false);

  // A real session always trumps the demo flag.
  const enabled = flag && !session;

  // Survive page reloads (iOS reloads PWAs on backgrounding mid-show-and-tell)
  // — but never restore the flag over an existing sign-in.
  useEffect(() => {
    void (async () => {
      const [saved, { data }] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        supabase.auth.getSession(),
      ]);
      if (saved === "1" && !data.session) setFlag(true);
    })();
  }, []);

  const enter = () => {
    resetDemoDb();
    queryClient.clear();
    setFlag(true);
    AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});
  };

  const exit = () => {
    setFlag(false);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    queryClient.clear();
  };

  return (
    <DemoContext.Provider value={{ enabled, enter, exit }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Static seed data
// ---------------------------------------------------------------------------

const DEMO_USER_ID = "demo-user";

export const DEMO_ROLE: Role = "member";

export const DEMO_HOUSEHOLD: Household = {
  id: "demo-household",
  name: "The Demo House",
  created_by: DEMO_USER_ID,
  created_at: "2024-01-01T00:00:00Z",
};

const cat = (
  id: string,
  name: string,
  icon: string,
  default_lifespan_years: number | null,
  sort_order: number,
): ItemCategory => ({ id, name, icon, default_lifespan_years, sort_order });

// Mirrors supabase/migrations/20260610000003_seed_categories.sql.
const DEMO_CATEGORIES: ItemCategory[] = [
  cat("demo-cat-roof", "Roof (asphalt shingle)", "🏠", 20, 10),
  cat("demo-cat-furnace", "HVAC – furnace", "🔥", 18, 20),
  cat("demo-cat-ac", "HVAC – A/C condenser", "❄️", 15, 30),
  cat("demo-cat-water-heater", "Water heater (tank)", "🚿", 11, 40),
  cat("demo-cat-windows", "Windows", "🪟", 25, 50),
  cat("demo-cat-sprinkler", "Sprinkler/irrigation", "💧", 20, 60),
  cat("demo-cat-cabinets", "Cabinets", "🗄️", 30, 70),
  cat("demo-cat-dishwasher", "Dishwasher", "🍽️", 10, 80),
  cat("demo-cat-fridge", "Refrigerator", "🧊", 13, 90),
  cat("demo-cat-washer", "Washer", "🧺", 11, 100),
  cat("demo-cat-dryer", "Dryer", "👕", 13, 110),
  cat("demo-cat-range", "Range/oven", "🍳", 14, 120),
  cat("demo-cat-garage", "Garage door opener", "🚗", 12, 130),
  cat("demo-cat-sump", "Sump pump", "🕳️", 10, 140),
  cat("demo-cat-other", "Other", "📦", null, 150),
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO date `months` months before today (local), on the given day of month. */
function isoMonthsAgo(months: number, day = 1): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, day);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Seed dates are relative to "now" so the lifespan bars and the 5-year
 * replacement outlook always show a healthy/aging/end-of-life mix, no matter
 * when the demo is opened. `index` drives newest-first list order.
 */
function seedItem(
  index: number,
  categoryId: string,
  name: string,
  monthsOld: number,
  extra: Partial<ItemWithCategory>,
): ItemWithCategory {
  const category = DEMO_CATEGORIES.find((c) => c.id === categoryId)!;
  const createdAt = new Date(Date.now() - index * 60_000).toISOString();
  return {
    id: `demo-item-${index}`,
    household_id: DEMO_HOUSEHOLD.id,
    category_id: categoryId,
    name,
    location: null,
    purchase_date: isoMonthsAgo(monthsOld),
    purchase_date_precision: "month",
    price_cents: null,
    vendor: null,
    brand: null,
    model: null,
    serial_number: null,
    warranty_until: null,
    lifespan_years_override: null,
    notes: null,
    created_by: DEMO_USER_ID,
    created_at: createdAt,
    updated_at: createdAt,
    ...extra,
    category,
  };
}

function seedLog(
  index: number,
  itemId: string,
  monthsAgo: number,
  extra: Partial<MaintenanceLog>,
): MaintenanceLog {
  return {
    id: `demo-log-${index}`,
    item_id: itemId,
    performed_on: isoMonthsAgo(monthsAgo, 14),
    cost_cents: null,
    performed_by: null,
    notes: null,
    created_by: DEMO_USER_ID,
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
    ...extra,
  };
}

function seed(): { items: ItemWithCategory[]; logs: MaintenanceLog[] } {
  const items = [
    seedItem(1, "demo-cat-water-heater", "Water heater", 120, {
      location: "Basement",
      price_cents: 135_000,
      brand: "Rheem",
      model: "XG50T",
      notes: "50-gallon natural gas. Shut-off valve is on the left.",
    }),
    seedItem(2, "demo-cat-garage", "Garage door opener", 138, {
      location: "Garage",
      price_cents: 32_900,
      brand: "Chamberlain",
      model: "B970",
    }),
    seedItem(3, "demo-cat-sump", "Sump pump", 108, {
      location: "Basement",
      price_cents: 18_900,
      brand: "Zoeller",
      model: "M53",
    }),
    seedItem(4, "demo-cat-roof", "Asphalt shingle roof", 192, {
      location: "Exterior",
      price_cents: 1_450_000,
      vendor: "Summit Roofing Co.",
      notes: "30-yr architectural shingles over the original deck.",
    }),
    seedItem(5, "demo-cat-ac", "A/C condenser", 144, {
      location: "Side yard",
      price_cents: 420_000,
      brand: "Carrier",
      model: "24ACC6",
    }),
    seedItem(6, "demo-cat-dishwasher", "Dishwasher", 84, {
      location: "Kitchen",
      price_cents: 84_900,
      brand: "Bosch",
      model: "SHEM63W55N",
    }),
    seedItem(7, "demo-cat-furnace", "Furnace", 144, {
      location: "Basement",
      price_cents: 580_000,
      brand: "Carrier",
      model: "59SC5B",
      vendor: "ComfortPro HVAC",
    }),
    seedItem(8, "demo-cat-washer", "Washer", 49, {
      location: "Laundry room",
      price_cents: 109_900,
      brand: "Speed Queen",
      model: "TR7",
    }),
    seedItem(9, "demo-cat-dryer", "Dryer", 49, {
      location: "Laundry room",
      price_cents: 99_900,
      brand: "Speed Queen",
      model: "DR7",
    }),
    seedItem(10, "demo-cat-fridge", "Kitchen refrigerator", 26, {
      location: "Kitchen",
      price_cents: 249_900,
      brand: "LG",
      model: "LFXS26973S",
      warranty_until: isoMonthsAgo(26 - 24),
    }),
  ];

  const logs = [
    seedLog(1, "demo-item-10", 3, {
      cost_cents: 5_400,
      performed_by: "self",
      notes: "Replaced water filter.",
    }),
    seedLog(2, "demo-item-2", 5, {
      performed_by: "self",
      notes: "Lubricated rollers and chain, re-tensioned springs checked.",
    }),
    seedLog(3, "demo-item-7", 8, {
      cost_cents: 12_900,
      performed_by: "ComfortPro HVAC",
      notes: "Annual tune-up, new filter.",
    }),
    seedLog(4, "demo-item-4", 10, {
      cost_cents: 32_500,
      performed_by: "Summit Roofing Co.",
      notes: "Replaced wind-damaged shingles, resealed chimney flashing.",
    }),
    seedLog(5, "demo-item-1", 14, {
      cost_cents: 3_500,
      performed_by: "self",
      notes: "Flushed tank, inspected anode rod.",
    }),
    seedLog(6, "demo-item-7", 20, {
      cost_cents: 11_900,
      performed_by: "ComfortPro HVAC",
      notes: "Annual tune-up.",
    }),
  ];

  return { items, logs };
}

// ---------------------------------------------------------------------------
// In-memory store. Mutated immutably so react-query consumers re-render.
// ---------------------------------------------------------------------------

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];
type ItemUpdate = Database["public"]["Tables"]["items"]["Update"];
type LogInsert = Database["public"]["Tables"]["maintenance_logs"]["Insert"];

let db = seed();
let seq = 0;

function resetDemoDb() {
  db = seed();
  seq = 0;
}

export const demoDb = {
  categories: (): ItemCategory[] => DEMO_CATEGORIES,

  listItems: (): ItemWithCategory[] =>
    [...db.items].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),

  getItem: (id: string): ItemWithCategory => {
    const item = db.items.find((i) => i.id === id);
    if (!item) throw new Error("Item not found");
    return item;
  },

  createItem: (values: ItemInsert): ItemWithCategory => {
    const category = DEMO_CATEGORIES.find((c) => c.id === values.category_id);
    if (!category) throw new Error("Unknown category");
    const now = new Date().toISOString();
    const item: ItemWithCategory = {
      id: `demo-new-item-${++seq}`,
      household_id: values.household_id,
      category_id: values.category_id,
      name: values.name,
      location: values.location ?? null,
      purchase_date: values.purchase_date ?? null,
      purchase_date_precision: values.purchase_date_precision ?? "day",
      price_cents: values.price_cents ?? null,
      vendor: values.vendor ?? null,
      brand: values.brand ?? null,
      model: values.model ?? null,
      serial_number: values.serial_number ?? null,
      warranty_until: values.warranty_until ?? null,
      lifespan_years_override: values.lifespan_years_override ?? null,
      notes: values.notes ?? null,
      created_by: DEMO_USER_ID,
      created_at: now,
      updated_at: now,
      category,
    };
    db.items = [item, ...db.items];
    return item;
  },

  updateItem: (id: string, values: ItemUpdate): ItemWithCategory => {
    const current = demoDb.getItem(id);
    const next: ItemWithCategory = {
      ...current,
      ...values,
      id,
      updated_at: new Date().toISOString(),
      category: values.category_id
        ? (DEMO_CATEGORIES.find((c) => c.id === values.category_id) ??
          current.category)
        : current.category,
    };
    db.items = db.items.map((i) => (i.id === id ? next : i));
    return next;
  },

  deleteItem: (id: string) => {
    db.items = db.items.filter((i) => i.id !== id);
    db.logs = db.logs.filter((l) => l.item_id !== id);
  },

  listLogs: (itemId: string): MaintenanceLog[] =>
    db.logs
      .filter((l) => l.item_id === itemId)
      .sort((a, b) => (a.performed_on < b.performed_on ? 1 : -1)),

  createLog: (values: LogInsert): MaintenanceLog => {
    const log: MaintenanceLog = {
      id: `demo-new-log-${++seq}`,
      item_id: values.item_id,
      performed_on: values.performed_on,
      cost_cents: values.cost_cents ?? null,
      performed_by: values.performed_by ?? null,
      notes: values.notes ?? null,
      created_by: DEMO_USER_ID,
      created_at: new Date().toISOString(),
    };
    db.logs = [log, ...db.logs];
    return log;
  },

  deleteLog: (id: string) => {
    db.logs = db.logs.filter((l) => l.id !== id);
  },

  members: (): HouseholdMember[] => [
    {
      household_id: DEMO_HOUSEHOLD.id,
      user_id: DEMO_USER_ID,
      role: DEMO_ROLE,
      created_at: DEMO_HOUSEHOLD.created_at,
    },
  ],
};
