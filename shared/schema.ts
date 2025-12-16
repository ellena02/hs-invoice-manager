import { z } from "zod";
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// OAuth token storage for HubSpot portals
export const hubspotTokens = pgTable("hubspot_tokens", {
  portalId: text("portal_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHubspotTokenSchema = createInsertSchema(hubspotTokens).omit({ createdAt: true, updatedAt: true });
export type InsertHubspotToken = z.infer<typeof insertHubspotTokenSchema>;
export type HubspotToken = typeof hubspotTokens.$inferSelect;

export const markBadDebtRequestSchema = z.object({
  companyId: z.string().min(1, "Company ID is required"),
  badDebt: z.union([z.boolean(), z.string(), z.number()]),
});

export type MarkBadDebtRequest = z.infer<typeof markBadDebtRequestSchema>;

// Mark bad debt on specific invoice (cascades to deal and company)
export const markInvoiceBadDebtRequestSchema = z.object({
  companyId: z.string().min(1, "Company ID is required"),
  invoiceId: z.string().min(1, "Invoice ID is required"),
  dealId: z.string().nullable().optional(),
});

export type MarkInvoiceBadDebtRequest = z.infer<typeof markInvoiceBadDebtRequestSchema>;

export interface MarkBadDebtResponse {
  success: boolean;
  bad_debt?: string;
  message?: string;
  updatedInvoice?: boolean;
  updatedDeal?: boolean;
  updatedCompany?: boolean;
}

export interface HealthResponse {
  ok: boolean;
  timestamp?: string;
}

export interface Deal {
  id: string;
  dealname: string;
  amount: string | null;
  dealstage: string;
  closedate: string | null;
}

export interface Invoice {
  id: string;
  hs_invoice_number: string;
  hs_invoice_status: string; // draft, open, paid, voided
  hs_due_date: string | null; // ISO date string
  amount: string | null;
  dealId?: string | null;
  dealName?: string | null;
}

export interface Company {
  id: string;
  name: string;
  bad_debt: string;
}

export interface CompanyData {
  company: Company | null;
  deals: Deal[];
  invoices: Invoice[];
  overdueCount?: number;
}

