import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Attachment,
  Database,
  HouseholdInvite,
  HouseholdMember,
  ItemCategory,
  ItemWithCategory,
  MaintenanceLog,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];
type ItemUpdate = Database["public"]["Tables"]["items"]["Update"];
type LogInsert = Database["public"]["Tables"]["maintenance_logs"]["Insert"];

const ITEM_SELECT = "*, category:item_categories(*)";

// ---------------------------------------------------------------------------
// Categories (global, seeded)
// ---------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    staleTime: Infinity,
    queryFn: async (): Promise<ItemCategory[]> => {
      const { data, error } = await supabase
        .from("item_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function useItems(householdId: string | undefined) {
  return useQuery({
    queryKey: ["items", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<ItemWithCategory[]> => {
      const { data, error } = await supabase
        .from("items")
        .select(ITEM_SELECT)
        .eq("household_id", householdId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ItemWithCategory[];
    },
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: ["item", id],
    enabled: !!id,
    queryFn: async (): Promise<ItemWithCategory> => {
      const { data, error } = await supabase
        .from("items")
        .select(ITEM_SELECT)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as ItemWithCategory;
    },
  });
}

function useInvalidateItems() {
  const qc = useQueryClient();
  return (item: { id?: string; household_id?: string }) => {
    void qc.invalidateQueries({ queryKey: ["items", item.household_id] });
    if (item.id) void qc.invalidateQueries({ queryKey: ["item", item.id] });
  };
}

export function useCreateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async (values: ItemInsert) => {
      const { data, error } = await supabase
        .from("items")
        .insert(values)
        .select(ITEM_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as ItemWithCategory;
    },
    onSuccess: (item) => invalidate(item),
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async ({ id, ...values }: ItemUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("items")
        .update(values)
        .eq("id", id)
        .select(ITEM_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as ItemWithCategory;
    },
    onSuccess: (item) => invalidate(item),
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async (item: { id: string; household_id: string }) => {
      const { error } = await supabase.from("items").delete().eq("id", item.id);
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => invalidate(item),
  });
}

// ---------------------------------------------------------------------------
// Maintenance logs
// ---------------------------------------------------------------------------

export type HouseholdLog = MaintenanceLog & {
  item: { id: string; name: string; household_id: string };
};

/** Every log in the household, newest first — feeds the Home dashboard. */
export function useHouseholdLogs(householdId: string | undefined) {
  return useQuery({
    queryKey: ["household-logs", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdLog[]> => {
      const { data, error } = await supabase
        .from("maintenance_logs")
        .select("*, item:items!inner(id, name, household_id)")
        .eq("item.household_id", householdId!)
        .order("performed_on", { ascending: false });
      if (error) throw error;
      return data as unknown as HouseholdLog[];
    },
  });
}

export function useLogs(itemId: string | undefined) {
  return useQuery({
    queryKey: ["logs", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<MaintenanceLog[]> => {
      const { data, error } = await supabase
        .from("maintenance_logs")
        .select("*")
        .eq("item_id", itemId!)
        .order("performed_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: LogInsert) => {
      const { data, error } = await supabase
        .from("maintenance_logs")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (log) => {
      void qc.invalidateQueries({ queryKey: ["logs", log.item_id] });
      void qc.invalidateQueries({ queryKey: ["household-logs"] });
    },
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: { id: string; item_id: string }) => {
      const { error } = await supabase
        .from("maintenance_logs")
        .delete()
        .eq("id", log.id);
      if (error) throw error;
      return log;
    },
    onSuccess: (log) => {
      void qc.invalidateQueries({ queryKey: ["logs", log.item_id] });
      void qc.invalidateQueries({ queryKey: ["household-logs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Attachments (Supabase Storage, per-household path prefix — §2.4)
// ---------------------------------------------------------------------------

export function useAttachments(itemId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*")
        .eq("item_id", itemId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type UploadAttachmentArgs = {
  householdId: string;
  itemId: string;
  maintenanceLogId?: string;
  fileName: string;
  mimeType: string;
  /** File body: ArrayBuffer from fetch()ing the picker asset URI. */
  body: ArrayBuffer;
};

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UploadAttachmentArgs) => {
      const path = `${args.householdId}/${args.itemId}/${Date.now()}-${args.fileName}`;
      const { error: storageError } = await supabase.storage
        .from("attachments")
        .upload(path, args.body, { contentType: args.mimeType });
      if (storageError) throw storageError;

      const { data, error } = await supabase
        .from("attachments")
        .insert({
          item_id: args.itemId,
          maintenance_log_id: args.maintenanceLogId ?? null,
          storage_path: path,
          mime_type: args.mimeType,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (att) =>
      void qc.invalidateQueries({ queryKey: ["attachments", att.item_id] }),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: Attachment) => {
      const { error } = await supabase
        .from("attachments")
        .delete()
        .eq("id", att.id);
      if (error) throw error;
      await supabase.storage.from("attachments").remove([att.storage_path]);
      return att;
    },
    onSuccess: (att) =>
      void qc.invalidateQueries({ queryKey: ["attachments", att.item_id] }),
  });
}

export function useAttachmentUrl(storagePath: string) {
  return useQuery({
    queryKey: ["attachment-url", storagePath],
    staleTime: 50 * 60 * 1000, // signed for 60 min; refresh before expiry
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// ---------------------------------------------------------------------------
// Members & invites
// ---------------------------------------------------------------------------

export function useMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: ["members", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase
        .from("household_members")
        .select("*")
        .eq("household_id", householdId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useHouseholdInvites(householdId: string | undefined) {
  return useQuery({
    queryKey: ["invites", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdInvite[]> => {
      const { data, error } = await supabase
        .from("household_invites")
        .select("*")
        .eq("household_id", householdId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Pending invites addressed to the signed-in user's verified email. */
export function useMyInvites(myEmail: string | undefined) {
  return useQuery({
    queryKey: ["my-invites", myEmail],
    enabled: !!myEmail,
    queryFn: async (): Promise<
      (HouseholdInvite & { household: { name: string } | null })[]
    > => {
      const { data, error } = await supabase
        .from("household_invites")
        .select("*, household:households(name)")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      // RLS already limits rows to invites for my email + invites I manage as
      // owner; keep only the former and only ones not for my own household.
      return (
        data as unknown as (HouseholdInvite & {
          household: { name: string } | null;
        })[]
      ).filter((inv) => inv.email.toLowerCase() === myEmail!.toLowerCase());
    },
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { householdId: string; email: string }) => {
      const { data, error } = await supabase
        .from("household_invites")
        .insert({ household_id: args.householdId, email: args.email.trim() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (inv) =>
      void qc.invalidateQueries({ queryKey: ["invites", inv.household_id] }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inv: { id: string; household_id: string }) => {
      const { error } = await supabase
        .from("household_invites")
        .update({ status: "revoked" })
        .eq("id", inv.id);
      if (error) throw error;
      return inv;
    },
    onSuccess: (inv) =>
      void qc.invalidateQueries({ queryKey: ["invites", inv.household_id] }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc("accept_invite", {
        invite_id: inviteId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-invites"] });
      void qc.invalidateQueries({ queryKey: ["memberships"] });
    },
  });
}
