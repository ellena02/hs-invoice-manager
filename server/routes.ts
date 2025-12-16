import type { Express } from "express";
import { createServer, type Server } from "http";
import { Client as HubSpotClient } from "@hubspot/api-client";
import { markBadDebtRequestSchema } from "@shared/schema";

const HS_PRIVATE_APP_TOKEN = process.env.HS_PRIVATE_APP_TOKEN;

let hubspotClient: HubSpotClient | null = null;
if (HS_PRIVATE_APP_TOKEN) {
  hubspotClient = new HubSpotClient({ accessToken: HS_PRIVATE_APP_TOKEN });
}

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

  app.get("/api/company/:companyId", async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!hubspotClient) {
        return res.status(200).json({
          company: {
            id: companyId,
            name: "Demo Company",
            bad_debt: "false"
          },
          deals: [
            { id: "1", dealname: "Enterprise License", amount: "50000", dealstage: "contractsent", closedate: "2024-01-15" },
            { id: "2", dealname: "Support Package", amount: "12000", dealstage: "closedwon", closedate: "2024-02-20" },
            { id: "3", dealname: "Training Services", amount: "8500", dealstage: "qualifiedtobuy", closedate: "2024-03-10" },
          ],
          invoices: [
            { id: "101", hs_invoice_number: "INV-2024-001", hs_invoice_status: "paid", amount: "25000" },
            { id: "102", hs_invoice_number: "INV-2024-002", hs_invoice_status: "pending", amount: "15000" },
            { id: "103", hs_invoice_number: "INV-2024-003", hs_invoice_status: "overdue", amount: "10000" },
          ],
          message: "Mock data - HubSpot token not configured"
        });
      }

      const companyResponse = await hubspotClient.crm.companies.basicApi.getById(
        companyId,
        ["name", "bad_debt"]
      );

      const dealsResponse = await hubspotClient.crm.companies.associationsApi.getAll(
        companyId,
        "deals"
      );

      const invoicesResponse = await hubspotClient.crm.companies.associationsApi.getAll(
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
      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status", "amount"]
          );
          invoices.push({
            id: invoice.id,
            hs_invoice_number: invoice.properties.hs_invoice_number || "",
            hs_invoice_status: invoice.properties.hs_invoice_status || "",
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
