import type { Express } from "express";
import { createServer, type Server } from "http";
import { Client as HubSpotClient } from "@hubspot/api-client";
import { markBadDebtRequestSchema, deleteOverdueInvoicesRequestSchema } from "@shared/schema";

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

  app.post("/api/company/:companyId/delete-overdue-invoices", async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!hubspotClient) {
        // Mock mode: simulate deleting overdue invoices
        const mockDeletedInvoices = ["INV-2024-003"];
        mockDeletedInvoices.forEach(inv => mockState.deletedInvoiceIds.add("103")); // ID of overdue invoice
        mockState.badDebt = true;
        
        return res.status(200).json({
          success: true,
          deletedCount: mockDeletedInvoices.length,
          deletedInvoices: mockDeletedInvoices,
          message: "Mock response - HubSpot token not configured. In production, overdue invoices would be permanently deleted."
        });
      }

      const invoicesResponse = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
        "companies",
        companyId,
        "invoices"
      );

      const overdueInvoices: { id: string; number: string }[] = [];
      
      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status"]
          );
          
          if (invoice.properties.hs_invoice_status?.toLowerCase() === "overdue") {
            overdueInvoices.push({
              id: invoice.id,
              number: invoice.properties.hs_invoice_number || invoice.id
            });
          }
        } catch (e) {
          console.error(`Failed to fetch invoice ${assoc.id}:`, e);
        }
      }

      const deletedInvoices: string[] = [];
      const failedInvoices: { number: string; reason: string }[] = [];
      
      for (const invoice of overdueInvoices) {
        try {
          // Use the purge/delete endpoint for permanent deletion
          // HubSpot client doesn't have a direct purge method, so we use apiRequest
          const response = await fetch(
            `https://api.hubapi.com/crm/v3/objects/invoices/${invoice.id}`,
            {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${HS_PRIVATE_APP_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );
          
          if (response.ok || response.status === 204) {
            deletedInvoices.push(invoice.number);
          } else {
            const errorBody = await response.json().catch(() => ({}));
            failedInvoices.push({
              number: invoice.number,
              reason: errorBody.message || `HTTP ${response.status}`
            });
          }
        } catch (e: any) {
          console.error(`Failed to delete invoice ${invoice.id}:`, e);
          failedInvoices.push({
            number: invoice.number,
            reason: e.message || "Unknown error"
          });
        }
      }

      await hubspotClient.crm.companies.basicApi.update(companyId, {
        properties: { bad_debt: "true" },
      });

      let message = `Successfully deleted ${deletedInvoices.length} overdue invoice(s) and marked company as bad debt.`;
      if (failedInvoices.length > 0) {
        message += ` Failed to delete ${failedInvoices.length} invoice(s): ${failedInvoices.map(f => `${f.number} (${f.reason})`).join(", ")}`;
      }

      return res.status(200).json({
        success: true,
        deletedCount: deletedInvoices.length,
        deletedInvoices,
        failedInvoices,
        message
      });
    } catch (error: any) {
      console.error("Delete overdue invoices error:", error?.response?.body || error);
      return res.status(500).json({
        success: false,
        deletedCount: 0,
        deletedInvoices: [],
        message: error?.response?.body?.message || error?.message || "Failed to delete overdue invoices."
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
