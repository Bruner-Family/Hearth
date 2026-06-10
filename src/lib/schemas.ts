import { z } from "zod";

// Shared between forms and any future tooling (ADR-001 §2.1).

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date");

const optionalText = z.string().trim().max(200).optional().or(z.literal(""));

const optionalDate = isoDate.optional().or(z.literal(""));

const optionalMoney = z
  .string()
  .regex(/^[$]?[\d,]*\.?\d{0,2}$/, "Enter a dollar amount")
  .optional()
  .or(z.literal(""));

export const itemFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category_id: z.uuid("Pick a category"),
  location: optionalText,
  purchase_date: optionalDate,
  price: optionalMoney,
  vendor: optionalText,
  brand: optionalText,
  model: optionalText,
  serial_number: optionalText,
  warranty_until: optionalDate,
  lifespan_years_override: z
    .string()
    .regex(/^\d{0,3}(\.\d)?$/, "Years, e.g. 12 or 12.5")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;

export const logFormSchema = z.object({
  performed_on: isoDate,
  cost: optionalMoney,
  performed_by: optionalText,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type LogFormValues = z.infer<typeof logFormSchema>;

export const inviteFormSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;
