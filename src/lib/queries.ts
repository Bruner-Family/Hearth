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
import { demoDb, useDemo } from "@/lib/demo";
import { supabase } from "@/lib/supabase";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];
type ItemUpdate = Database["public"]["Tables"]["items"]["Update"];
type LogInsert = Database["public"]["Tables"]["maintenance_logs"]["Insert"];

const ITEM_SELECT = "*, category:item_categories(*)";

// ---------------------------------------------------------------------------
// Categories (global, seeded)
// ---------------------------------------------------------------------------

export function useCategories() {
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["categories"],
    staleTime: Infinity,
    queryFn: async (): Promise<ItemCategory[]> => {
      if (demo) return demoDb.categories();
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
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["items", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<ItemWithCategory[]> => {
      if (demo) return demoDb.listItems();
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
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["item", id],
    enabled: !!id,
    queryFn: async (): Promise<ItemWithCategory> => {
      if (demo) return demoDb.getItem(id!);
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
  const { enabled: demo } = useDemo();
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async (values: ItemInsert) => {
      if (demo) return demoDb.createItem(values);
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
  const { enabled: demo } = useDemo();
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async ({ id, ...values }: ItemUpdate & { id: string }) => {
      if (demo) return demoDb.updateItem(id, values);
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
  const { enabled: demo } = useDemo();
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async (item: { id: string; household_id: string }) => {
      if (demo) {
        demoDb.deleteItem(item.id);
        return item;
      }
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

export function useLogs(itemId: string | undefined) {
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["logs", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<MaintenanceLog[]> => {
      if (demo) return demoDb.listLogs(itemId!);
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
  const { enabled: demo } = useDemo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: LogInsert) => {
      if (demo) return demoDb.createLog(values);
      const { data, error } = await supabase
        .from("maintenance_logs")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (log) =>
      void qc.invalidateQueries({ queryKey: ["logs", log.item_id] }),
  });
}

export function useDeleteLog() {
  const { enabled: demo } = useDemo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: { id: string; item_id: string }) => {
      if (demo) {
        demoDb.deleteLog(log.id);
        return log;
      }
      const { error } = await supabase
        .from("maintenance_logs")
        .delete()
        .eq("id", log.id);
      if (error) throw error;
      return log;
    },
    onSuccess: (log) =>
      void qc.invalidateQueries({ queryKey: ["logs", log.item_id] }),
  });
}

// ---------------------------------------------------------------------------
// Attachments (Supabase Storage, per-household path prefix — §2.4)
// ---------------------------------------------------------------------------

export function useAttachments(itemId: string | undefined) {
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["attachments", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<Attachment[]> => {
      if (demo) return [];
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
  const { enabled: demo } = useDemo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UploadAttachmentArgs) => {
      if (demo) throw new Error("Attachments are disabled in the demo.");
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
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["members", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdMember[]> => {
      if (demo) return demoDb.members();
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
