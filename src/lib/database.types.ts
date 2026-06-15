// Hand-maintained Supabase types for the v1 schema (ADR-001 §2.4).
// Keep in lockstep with supabase/migrations.

export type Role = "owner" | "member";
export type InviteStatus = "pending" | "accepted" | "revoked";
export type PurchaseDatePrecision = "day" | "month";

export type Household = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type HouseholdMember = {
  household_id: string;
  user_id: string;
  role: Role;
  created_at: string;
};

export type ItemCategory = {
  id: string;
  name: string;
  icon: string;
  default_lifespan_years: number | null;
  sort_order: number;
};

/** One reference pair, e.g. { label: "Filter", value: "16×25×1" } (spec v1.5). */
export type ReferenceDetail = { label: string; value: string };

export type Item = {
  id: string;
  household_id: string;
  category_id: string;
  name: string;
  location: string | null;
  purchase_date: string | null;
  purchase_date_precision: PurchaseDatePrecision;
  price_cents: number | null;
  vendor: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  warranty_until: string | null;
  lifespan_years_override: number | null;
  notes: string | null;
  reference_details: ReferenceDetail[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ItemWithCategory = Item & { category: ItemCategory };

export type MaintenanceLog = {
  id: string;
  item_id: string;
  performed_on: string;
  cost_cents: number | null;
  performed_by: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type MaintenanceSchedule = {
  id: string;
  household_id: string;
  item_id: string | null;
  name: string;
  /** Every N months; mutually exclusive with anchor_month (DB check). */
  interval_months: number | null;
  /** Yearly in this month (1–12); mutually exclusive with interval_months. */
  anchor_month: number | null;
  next_due: string;
  last_completed_on: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type NotificationSettings = {
  household_id: string;
  enabled: boolean;
  discord_webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  lead_time_days: number;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  item_id: string;
  maintenance_log_id: string | null;
  storage_path: string;
  mime_type: string;
  created_by: string;
  created_at: string;
};

export type HouseholdInvite = {
  id: string;
  household_id: string;
  email: string;
  invited_by: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
};

type TableOf<Row, Required extends keyof Row, Generated extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      households: TableOf<Household, "name", "id" | "created_at">;
      household_members: TableOf<
        HouseholdMember,
        "household_id" | "user_id",
        "created_at"
      >;
      item_categories: TableOf<ItemCategory, "name", "id">;
      items: TableOf<
        Item,
        "household_id" | "category_id" | "name",
        "id" | "created_at" | "updated_at"
      >;
      maintenance_logs: TableOf<
        MaintenanceLog,
        "item_id" | "performed_on",
        "id" | "created_at"
      >;
      maintenance_schedules: TableOf<
        MaintenanceSchedule,
        "household_id" | "name" | "next_due",
        "id" | "created_at" | "updated_at"
      >;
      notification_settings: TableOf<
        NotificationSettings,
        "household_id",
        "created_at" | "updated_at"
      >;
      attachments: TableOf<
        Attachment,
        "item_id" | "storage_path" | "mime_type",
        "id" | "created_at"
      >;
      household_invites: TableOf<
        HouseholdInvite,
        "household_id" | "email",
        "id" | "created_at"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      accept_invite: {
        Args: { invite_id: string };
        Returns: undefined;
      };
      complete_schedule: {
        Args: {
          schedule_id: string;
          performed_on: string;
          new_next_due: string;
          cost_cents?: number | null;
          performed_by?: string | null;
          notes?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
