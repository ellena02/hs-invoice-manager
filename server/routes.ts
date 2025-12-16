import type { Express } from "express";
import { createServer, type Server } from "http";
import { Client as HubSpotClient } from "@hubspot/api-client";
import { markBadDebtRequestSchema, archiveOverdueInvoicesRequestSchema } from "@shared/schema";

const HS_PRIVATE_APP_TOKEN = process.env.HS_PRIVATE_APP_TOKEN;

let hubspotClient: HubSpotClient | null = null;
if (HS_PRIVATE_APP_TOKEN) {
  hubspotClient = new HubSpotClient({ accessToken: HS_PRIVATE_APP_TOKEN });
}

// Mock state for demo mode (persists during session)
const mockState = {
  badDebt: false,
  deletedInvoiceIds: new Set<string>()
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", (_req, res) => {
    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      hubspotConnected: !!hubspotClient 
    });
  });

  app.post("/api/mark-bad-debt", async (req, res) => {
    try {
      const parseResult = markBadDebtRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          success: false, 
          message: parseResult.error.errors[0]?.message || "Invalid request body" 
        });
      }

      const { companyId, badDebt } = parseResult.data;

      const isChecked =
        badDebt === true || badDebt === "true" || badDebt === 1 || badDebt === "1";

      const newValue = isChecked ? "true" : "false";

      if (!hubspotClient) {
        console.warn("HubSpot client not configured - returning mock response");
        return res.status(200).json({ 
          success: true, 
          bad_debt: newValue,
          message: "Mock response - HubSpot token not configured"
        });
      }

      await hubspotClient.crm.companies.basicApi.update(companyId, {
        properties: { bad_debt: newValue },
      });

      return res.status(200).json({ success: true, bad_debt: newValue });
    } catch (error: any) {
      console.error("Backend mark-bad-debt error:", error?.response?.body || error);
      return res.status(500).json({
        success: false,
        message:
          error?.response?.body?.message || error?.message || "Unexpected backend error.",
      });
    }
  });

  // Archive a single invoice and mark company as bad debt
  app.post("/api/company/:companyId/invoice/:invoiceId/archive", async (req, res) => {
    try {
      const { companyId, invoiceId } = req.params;

      if (!hubspotClient) {
        // Mock mode
        mockState.deletedInvoiceIds.add(invoiceId);
        mockState.badDebt = true;
        
        return res.status(200).json({
          success: true,
          invoiceId,
          message: "Mock response - Invoice archived and company marked as bad debt."
        });
      }

      // Get invoice details first
      const invoice = await hubspotClient.crm.objects.basicApi.getById(
        "invoices",
        invoiceId,
        ["hs_invoice_number", "hs_invoice_status", "hs_collection_status", "hs_payment_status", "hs_amount_paid"]
      );

      const invoiceStatus = invoice.properties.hs_invoice_status?.toLowerCase() || "";
      const collectionStatus = invoice.properties.hs_collection_status?.toLowerCase() || "";
      const paymentStatus = invoice.properties.hs_payment_status?.toLowerCase() || "";
      const amountPaid = parseFloat(invoice.properties.hs_amount_paid || "0");

      // Verify invoice is overdue and not paid
      const isOverdue = collectionStatus === "overdue" || invoiceStatus === "overdue";
      const isPaid = invoiceStatus === "paid" || paymentStatus === "paid" || amountPaid > 0;

      if (!isOverdue || isPaid) {
        return res.status(400).json({
          success: false,
          message: "Invoice must be overdue and not paid to mark as bad debt."
        });
      }

      // Archive the invoice
      await hubspotClient.crm.objects.basicApi.archive("invoices", invoiceId);

      // Mark company as bad debt
      await hubspotClient.crm.companies.basicApi.update(companyId, {
        properties: { bad_debt: "true" },
      });

      return res.status(200).json({
        success: true,
        invoiceId,
        invoiceNumber: invoice.properties.hs_invoice_number,
        message: `Invoice ${invoice.properties.hs_invoice_number} archived and company marked as bad debt.`
      });
    } catch (error: any) {
      console.error("Archive single invoice error:", error?.response?.body || error);
      return res.status(500).json({
        success: false,
        message: error?.response?.body?.message || error?.message || "Failed to archive invoice."
      });
    }
  });

  app.post("/api/company/:companyId/archive-overdue-invoices", async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!hubspotClient) {
        // Mock mode: simulate archiving overdue invoices
        // HubSpot statuses: draft, open, paid, voided
        // Overdue = status is "open" AND due_date < today
        const allMockInvoices = [
          { id: "101", hs_invoice_number: "INV-2024-001", hs_invoice_status: "paid", hs_due_date: "2024-11-15" },
          { id: "102", hs_invoice_number: "INV-2024-002", hs_invoice_status: "open", hs_due_date: "2025-01-15" },
          { id: "103", hs_invoice_number: "INV-2024-003", hs_invoice_status: "open", hs_due_date: "2024-12-01" },
          { id: "104", hs_invoice_number: "INV-2024-004", hs_invoice_status: "open", hs_due_date: "2024-11-20" },
          { id: "105", hs_invoice_number: "INV-2024-005", hs_invoice_status: "draft", hs_due_date: null },
          { id: "106", hs_invoice_number: "INV-2024-006", hs_invoice_status: "voided", hs_due_date: "2024-10-01" },
        ];
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const overdueInvoices = allMockInvoices.filter(inv => {
          if (mockState.deletedInvoiceIds.has(inv.id)) return false;
          if (inv.hs_invoice_status !== "open" || !inv.hs_due_date) return false;
          const dueDate = new Date(inv.hs_due_date);
          return dueDate < today;
        });
        
        const archivedInvoiceNumbers = overdueInvoices.map(inv => inv.hs_invoice_number);
        overdueInvoices.forEach(inv => mockState.deletedInvoiceIds.add(inv.id));
        mockState.badDebt = true;
        
        return res.status(200).json({
          success: true,
          archivedCount: archivedInvoiceNumbers.length,
          archivedInvoices: archivedInvoiceNumbers,
          message: "Mock response - Overdue invoices archived (hidden from reporting)."
        });
      }

      const invoicesResponse = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
        "companies",
        companyId,
        "invoices"
      );

      // Filter invoices: must be OVERDUE and NOT PAID
      const overdueUnpaidInvoices: { id: string; number: string }[] = [];
      
      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status", "hs_collection_status", "hs_payment_status", "hs_amount_paid"]
          );
          
          const invoiceStatus = invoice.properties.hs_invoice_status?.toLowerCase() || "";
          const collectionStatus = invoice.properties.hs_collection_status?.toLowerCase() || "";
          const paymentStatus = invoice.properties.hs_payment_status?.toLowerCase() || "";
          const amountPaid = parseFloat(invoice.properties.hs_amount_paid || "0");
          
          // Check if invoice is overdue (collection status OR invoice status) AND not paid
          const isOverdue = collectionStatus === "overdue" || invoiceStatus === "overdue";
          const isPaid = invoiceStatus === "paid" || paymentStatus === "paid" || amountPaid > 0;
          
          if (isOverdue && !isPaid) {
            overdueUnpaidInvoices.push({
              id: invoice.id,
              number: invoice.properties.hs_invoice_number || invoice.id
            });
          }
        } catch (e) {
          console.error(`Failed to fetch invoice ${assoc.id}:`, e);
        }
      }

      const archivedInvoices: string[] = [];
      const failedInvoices: { number: string; reason: string }[] = [];
      
      for (const invoice of overdueUnpaidInvoices) {
        try {
          // Archive the invoice - this works for all invoice statuses
          await hubspotClient.crm.objects.basicApi.archive("invoices", invoice.id);
          archivedInvoices.push(invoice.number);
        } catch (e: any) {
          console.error(`Failed to archive invoice ${invoice.id}:`, e);
          failedInvoices.push({
            number: invoice.number,
            reason: e?.response?.body?.message || e.message || "Unknown error"
          });
        }
      }

      // Mark company as bad debt
      await hubspotClient.crm.companies.basicApi.update(companyId, {
        properties: { bad_debt: "true" },
      });

      let message = `Company marked as bad debt. `;
      if (archivedInvoices.length > 0) {
        message += `Archived ${archivedInvoices.length} overdue invoice(s): ${archivedInvoices.join(", ")}. `;
        message += `They are now hidden from reporting and can be restored within 90 days.`;
      }
      if (failedInvoices.length > 0) {
        message += ` Failed to archive ${failedInvoices.length} invoice(s): ${failedInvoices.map(f => `${f.number} (${f.reason})`).join(", ")}`;
      }

      return res.status(200).json({
        success: true,
        archivedCount: archivedInvoices.length,
        archivedInvoices,
        failedInvoices,
        message: message.trim()
      });
    } catch (error: any) {
      console.error("Archive overdue invoices error:", error?.response?.body || error);
      return res.status(500).json({
        success: false,
        archivedCount: 0,
        archivedInvoices: [],
        message: error?.response?.body?.message || error?.message || "Failed to archive overdue invoices."
      });
    }
  });

  app.get("/api/company/:companyId", async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!hubspotClient) {
        const mockDeals = [
          { id: "1", dealname: "Enterprise License", amount: "50000", dealstage: "contractsent", closedate: "2024-01-15" },
          { id: "2", dealname: "Support Package", amount: "12000", dealstage: "closedwon", closedate: "2024-02-20" },
          { id: "3", dealname: "Training Services", amount: "8500", dealstage: "qualifiedtobuy", closedate: "2024-03-10" },
        ];
        // HubSpot invoice statuses: draft, open, paid, voided
        // Overdue is calculated: status is "open" AND due_date < today
        const allMockInvoices = [
          { id: "101", hs_invoice_number: "INV-2024-001", hs_invoice_status: "paid", hs_due_date: "2024-11-15", amount: "25000", dealId: "1", dealName: "Enterprise License" },
          { id: "102", hs_invoice_number: "INV-2024-002", hs_invoice_status: "open", hs_due_date: "2025-01-15", amount: "15000", dealId: "2", dealName: "Support Package" },
          { id: "103", hs_invoice_number: "INV-2024-003", hs_invoice_status: "open", hs_due_date: "2024-12-01", amount: "10000", dealId: "3", dealName: "Training Services" },
          { id: "104", hs_invoice_number: "INV-2024-004", hs_invoice_status: "open", hs_due_date: "2024-11-20", amount: "5000", dealId: "1", dealName: "Enterprise License" },
          { id: "105", hs_invoice_number: "INV-2024-005", hs_invoice_status: "draft", hs_due_date: null, amount: "8000", dealId: "2", dealName: "Support Package" },
          { id: "106", hs_invoice_number: "INV-2024-006", hs_invoice_status: "voided", hs_due_date: "2024-10-01", amount: "3000", dealId: "3", dealName: "Training Services" },
        ];
        // Filter out archived invoices
        const mockInvoices = allMockInvoices.filter(inv => !mockState.deletedInvoiceIds.has(inv.id));
        
        // Calculate overdue: status is "open" AND due_date < today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdueCount = mockInvoices.filter(inv => {
          if (inv.hs_invoice_status !== "open" || !inv.hs_due_date) return false;
          const dueDate = new Date(inv.hs_due_date);
          return dueDate < today;
        }).length;
        
        return res.status(200).json({
          company: {
            id: companyId,
            name: "Demo Company",
            bad_debt: mockState.badDebt ? "true" : "false"
          },
          deals: mockDeals,
          invoices: mockInvoices,
          overdueCount,
          message: "Mock data - HubSpot token not configured"
        });
      }

      const companyResponse = await hubspotClient.crm.companies.basicApi.getById(
        companyId,
        ["name", "bad_debt"]
      );

      const dealsResponse = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
        "companies",
        companyId,
        "deals"
      );

      const invoicesResponse = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
        "companies",
        companyId,
        "invoices"
      );

      const deals = [];
      for (const assoc of dealsResponse.results || []) {
        try {
          const deal = await hubspotClient.crm.deals.basicApi.getById(
            assoc.id,
            ["dealname", "amount", "dealstage", "closedate"]
          );
          deals.push({
            id: deal.id,
            dealname: deal.properties.dealname || "",
            amount: deal.properties.amount || null,
            dealstage: deal.properties.dealstage || "",
            closedate: deal.properties.closedate || null,
          });
        } catch (e) {
          console.error(`Failed to fetch deal ${assoc.id}:`, e);
        }
      }

      // Create a map of deal IDs to deal names for quick lookup
      const dealMap = new Map<string, string>();
      for (const deal of deals) {
        dealMap.set(deal.id, deal.dealname);
      }

      const invoices = [];
      let overdueCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status", "hs_due_date", "amount"]
          );
          const status = invoice.properties.hs_invoice_status || "";
          const dueDate = invoice.properties.hs_due_date || null;
          
          // Calculate overdue: status is "open" AND due_date < today
          if (status.toLowerCase() === "open" && dueDate) {
            const dueDateObj = new Date(dueDate);
            if (dueDateObj < today) {
              overdueCount++;
            }
          }

          // Try to get deal association for this invoice
          let dealId: string | null = null;
          let dealName: string | null = null;
          try {
            const invoiceDealAssoc = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
              "invoices",
              assoc.id,
              "deals"
            );
            if (invoiceDealAssoc.results && invoiceDealAssoc.results.length > 0) {
              dealId = invoiceDealAssoc.results[0].id;
              dealName = dealMap.get(dealId) || null;
              // If deal not in our map, fetch it
              if (!dealName && dealId) {
                try {
                  const dealInfo = await hubspotClient.crm.deals.basicApi.getById(dealId, ["dealname"]);
                  dealName = dealInfo.properties.dealname || null;
                } catch (e) {
                  console.error(`Failed to fetch deal name for ${dealId}:`, e);
                }
              }
            }
          } catch (e) {
            // Invoice may not have a deal association
          }

          invoices.push({
            id: invoice.id,
            hs_invoice_number: invoice.properties.hs_invoice_number || "",
            hs_invoice_status: status,
            hs_due_date: dueDate,
            amount: invoice.properties.amount || null,
            dealId,
            dealName,
          });
        } catch (e) {
          console.error(`Failed to fetch invoice ${assoc.id}:`, e);
        }
      }

      return res.status(200).json({
        company: {
          id: companyResponse.id,
          name: companyResponse.properties.name || "",
          bad_debt: companyResponse.properties.bad_debt || "false",
        },
        deals,
        invoices,
        overdueCount,
      });
    } catch (error: any) {
      console.error("Error fetching company data:", error?.response?.body || error);
      return res.status(500).json({
        success: false,
        message: error?.response?.body?.message || error?.message || "Failed to fetch company data",
      });
    }
  });

  return httpServer;
}
