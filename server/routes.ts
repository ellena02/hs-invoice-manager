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
        const mockArchivedInvoices = ["INV-2024-003"];
        mockArchivedInvoices.forEach(() => mockState.deletedInvoiceIds.add("103"));
        mockState.badDebt = true;
        
        return res.status(200).json({
          success: true,
          archivedCount: mockArchivedInvoices.length,
          archivedInvoices: mockArchivedInvoices,
          message: "Mock response - In production, overdue unpaid invoices would be archived (hidden from reporting)."
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
        const allMockInvoices = [
          { id: "101", hs_invoice_number: "INV-2024-001", hs_invoice_status: "paid", amount: "25000" },
          { id: "102", hs_invoice_number: "INV-2024-002", hs_invoice_status: "pending", amount: "15000" },
          { id: "103", hs_invoice_number: "INV-2024-003", hs_invoice_status: "overdue", amount: "10000" },
        ];
        // Filter out deleted invoices
        const mockInvoices = allMockInvoices.filter(inv => !mockState.deletedInvoiceIds.has(inv.id));
        const overdueCount = mockInvoices.filter(inv => inv.hs_invoice_status === "overdue").length;
        
        return res.status(200).json({
          company: {
            id: companyId,
            name: "Demo Company",
            bad_debt: mockState.badDebt ? "true" : "false"
          },
          deals: [
            { id: "1", dealname: "Enterprise License", amount: "50000", dealstage: "contractsent", closedate: "2024-01-15" },
            { id: "2", dealname: "Support Package", amount: "12000", dealstage: "closedwon", closedate: "2024-02-20" },
            { id: "3", dealname: "Training Services", amount: "8500", dealstage: "qualifiedtobuy", closedate: "2024-03-10" },
          ],
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

      const invoices = [];
      let overdueCount = 0;
      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status", "amount"]
          );
          const status = invoice.properties.hs_invoice_status || "";
          if (status.toLowerCase() === "overdue") {
            overdueCount++;
          }
          invoices.push({
            id: invoice.id,
            hs_invoice_number: invoice.properties.hs_invoice_number || "",
            hs_invoice_status: status,
            amount: invoice.properties.amount || null,
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
