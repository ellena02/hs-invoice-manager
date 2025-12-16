import { z } from "zod";

export const markBadDebtRequestSchema = z.object({
  companyId: z.string().min(1, "Company ID is required"),
  badDebt: z.union([z.boolean(), z.string(), z.number()]),
});

export type MarkBadDebtRequest = z.infer<typeof markBadDebtRequestSchema>;

export interface MarkBadDebtResponse {
  success: boolean;
  bad_debt?: string;
  message?: string;
  archivedCount?: number;
  archivedInvoices?: string[];
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
  hs_invoice_status: string;
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

export const archiveOverdueInvoicesRequestSchema = z.object({
  companyId: z.string().min(1, "Company ID is required"),
});

export type ArchiveOverdueInvoicesRequest = z.infer<typeof archiveOverdueInvoicesRequestSchema>;

export interface ArchiveOverdueInvoicesResponse {
  success: boolean;
  archivedCount: number;
  archivedInvoices: string[];
  failedInvoices?: { number: string; reason: string }[];
  message?: string;
}

export interface ArchiveSingleInvoiceResponse {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  message?: string;
}
