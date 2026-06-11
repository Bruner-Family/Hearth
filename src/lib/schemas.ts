import { z } from "zod";

// Shared between forms and any future tooling (ADR-001 §2.1).

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date");

const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .refine((s) => {
    const month = Number(s.slice(5, 7));
    return month >= 1 && month <= 12;
  }, "Not a valid month");

const optionalText = z.string().trim().max(200).optional().or(z.literal(""));

const optionalDate = isoDate.optional().or(z.literal(""));

const optionalMonth = isoMonth.optional().or(z.literal(""));

const optionalMoney = z
  .string()
  .regex(/^[$]?[\d,]*\.?\d{0,2}$/, "Enter a dollar amount")
  .optional()
  .or(z.literal(""));

export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    category_id: z.uuid("Pick a category"),
    location: optionalText,
    // The purchase date only requires year/month; the day is optional
    // (docs/TODO.md). Combined into purchase_date + purchase_date_precision
    // on submit (combinePurchaseDate in @/lib/format).
    purchase_month: optionalMonth,
    purchase_day: z
      .string()
      .regex(/^\d{0,2}$/, "Day of the month")
      .optional()
      .or(z.literal("")),
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
  })
  .superRefine((values, ctx) => {
    if (!values.purchase_day) return;
    if (!values.purchase_month) {
      ctx.addIssue({
        code: "custom",
        path: ["purchase_day"],
        message: "Add the month first",
      });
      return;
    }
    const day = Number(values.purchase_day);
    const [year, month] = values.purchase_month.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      ctx.addIssue({
        code: "custom",
        path: ["purchase_day"],
        message: "Not a valid day for that month",
      });
    }
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
