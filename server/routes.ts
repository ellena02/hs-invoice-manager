import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Client as HubSpotClient } from "@hubspot/api-client";
import { markBadDebtRequestSchema, archiveOverdueInvoicesRequestSchema } from "@shared/schema";
import { storage } from "./storage";

// OAuth Configuration
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || "http://localhost:5000/auth/hubspot/callback";
const HUBSPOT_SCOPES = "crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.invoices.read crm.objects.invoices.write";

// For backwards compatibility - private app token (optional)
const HS_PRIVATE_APP_TOKEN = process.env.HS_PRIVATE_APP_TOKEN;

// Mock state for demo mode (persists during session)
const mockState = {
  badDebt: false
};

// OAuth state storage for CSRF protection (in production, use session or Redis)
const oauthStates = new Map<string, { createdAt: number }>();

// Clean up expired states (older than 10 minutes)
function cleanupOAuthStates() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const entries = Array.from(oauthStates.entries());
  for (const [state, data] of entries) {
    if (data.createdAt < tenMinutesAgo) {
      oauthStates.delete(state);
    }
  }
}

// Generate random state for OAuth CSRF protection
function generateOAuthState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = '';
  for (let i = 0; i < 32; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}

// Helper to get HubSpot client for a portal
async function getHubSpotClient(portalId?: string): Promise<HubSpotClient | null> {
  // First try OAuth token if portalId provided
  if (portalId) {
    const token = await storage.getToken(portalId);
    if (token) {
      // Check if token needs refresh
      const now = Math.floor(Date.now() / 1000);
      if (token.expiresAt <= now + 60) {
        // Token expired or expiring soon - refresh it
        const refreshedToken = await refreshAccessToken(token.refreshToken, portalId);
        if (refreshedToken) {
          return new HubSpotClient({ accessToken: refreshedToken.accessToken });
        }
      } else {
        return new HubSpotClient({ accessToken: token.accessToken });
      }
    }
  }

  // Fallback to private app token if available
  if (HS_PRIVATE_APP_TOKEN) {
    return new HubSpotClient({ accessToken: HS_PRIVATE_APP_TOKEN });
  }

  return null;
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken: string, portalId: string) {
  if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
    console.error("OAuth credentials not configured for token refresh");
    return null;
  }

  try {
    const hubspotClient = new HubSpotClient();
    const result = await hubspotClient.oauth.tokensApi.create(
      "refresh_token",
      undefined,
      undefined,
      HUBSPOT_CLIENT_ID,
      HUBSPOT_CLIENT_SECRET,
      refreshToken
    );

    const newToken = {
      portalId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + result.expiresIn,
    };

    await storage.saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    await storage.deleteToken(portalId);
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // OAuth: Start authorization flow
  app.get("/auth/hubspot", (_req: Request, res: Response) => {
    if (!HUBSPOT_CLIENT_ID) {
      return res.status(500).json({ 
        error: "OAuth not configured. Set HUBSPOT_CLIENT_ID environment variable." 
      });
    }

    // Clean up old states and generate new one for CSRF protection
    cleanupOAuthStates();
    const state = generateOAuthState();
    oauthStates.set(state, { createdAt: Date.now() });

    const authUrl = new URL("https://app.hubspot.com/oauth/authorize");
    authUrl.searchParams.set("client_id", HUBSPOT_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", HUBSPOT_REDIRECT_URI);
    authUrl.searchParams.set("scope", HUBSPOT_SCOPES);
    authUrl.searchParams.set("state", state);
    
    res.redirect(authUrl.toString());
  });

  // OAuth: Handle callback
  app.get("/auth/hubspot/callback", async (req: Request, res: Response) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      return res.status(400).json({ 
        error: error as string, 
        description: error_description as string 
      });
    }

    // Verify state parameter for CSRF protection
    if (!state || typeof state !== "string" || !oauthStates.has(state)) {
      return res.status(400).json({ error: "Invalid or missing state parameter" });
    }
    oauthStates.delete(state); // State used, remove it

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: "OAuth not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET." 
      });
    }

    try {
      const hubspotClient = new HubSpotClient();
      const tokenResult = await hubspotClient.oauth.tokensApi.create(
        "authorization_code",
        code,
        HUBSPOT_REDIRECT_URI,
        HUBSPOT_CLIENT_ID,
        HUBSPOT_CLIENT_SECRET
      );

      // Get portal ID from access token info
      hubspotClient.setAccessToken(tokenResult.accessToken);
      const tokenInfo = await hubspotClient.oauth.accessTokensApi.get(tokenResult.accessToken);
      const portalId = tokenInfo.hubId?.toString() || "unknown";

      // Save token
      await storage.saveToken({
        portalId,
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokenResult.expiresIn,
      });

      // Redirect to app with portal ID
      res.redirect(`/?portalId=${portalId}&connected=true`);
    } catch (error: any) {
      console.error("OAuth callback error:", error?.response?.body || error);
      res.status(500).json({
        error: "Failed to exchange authorization code",
        details: error?.response?.body?.message || error?.message
      });
    }
  });

  // Check OAuth status
  app.get("/auth/status", async (req: Request, res: Response) => {
    const portalId = req.query.portalId as string;
    
    if (portalId) {
      const token = await storage.getToken(portalId);
      if (token) {
        const now = Math.floor(Date.now() / 1000);
        return res.json({
          connected: true,
          portalId,
          expiresIn: token.expiresAt - now,
          oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET)
        });
      }
    }

    res.json({
      connected: !!HS_PRIVATE_APP_TOKEN,
      privateAppMode: !!HS_PRIVATE_APP_TOKEN,
      oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET)
    });
  });

  // Disconnect/logout
  app.post("/auth/disconnect", async (req: Request, res: Response) => {
    const portalId = req.query.portalId as string;
    if (portalId) {
      await storage.deleteToken(portalId);
    }
    res.json({ success: true });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET),
      privateAppConfigured: !!HS_PRIVATE_APP_TOKEN
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
      const portalId = req.query.portalId as string;

      const isChecked =
        badDebt === true || badDebt === "true" || badDebt === 1 || badDebt === "1";

      const newValue = isChecked ? "true" : "false";

      const hubspotClient = await getHubSpotClient(portalId);
      if (!hubspotClient) {
        console.warn("HubSpot client not configured - returning mock response");
        mockState.badDebt = isChecked;
        return res.status(200).json({ 
          success: true, 
          bad_debt: newValue,
          message: "Mock response - HubSpot not connected"
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
      const portalId = req.query.portalId as string;

      const hubspotClient = await getHubSpotClient(portalId);
      if (!hubspotClient) {
        const mockDeals = [
          { id: "1", dealname: "Enterprise License", amount: "50000", dealstage: "contractsent", closedate: "2024-01-15" },
          { id: "2", dealname: "Support Package", amount: "12000", dealstage: "closedwon", closedate: "2024-02-20" },
          { id: "3", dealname: "Training Services", amount: "8500", dealstage: "qualifiedtobuy", closedate: "2024-03-10" },
        ];
        const mockInvoices = [
          { id: "101", hs_invoice_number: "INV-2024-001", hs_invoice_status: "paid", hs_due_date: "2024-11-15", amount: "25000", dealId: "1", dealName: "Enterprise License" },
          { id: "102", hs_invoice_number: "INV-2024-002", hs_invoice_status: "open", hs_due_date: "2025-01-15", amount: "15000", dealId: "2", dealName: "Support Package" },
          { id: "103", hs_invoice_number: "INV-2024-003", hs_invoice_status: "open", hs_due_date: "2024-12-01", amount: "10000", dealId: "3", dealName: "Training Services" },
          { id: "104", hs_invoice_number: "INV-2024-004", hs_invoice_status: "open", hs_due_date: "2024-11-20", amount: "5000", dealId: "1", dealName: "Enterprise License" },
          { id: "105", hs_invoice_number: "INV-2024-005", hs_invoice_status: "draft", hs_due_date: null, amount: "8000", dealId: "2", dealName: "Support Package" },
          { id: "106", hs_invoice_number: "INV-2024-006", hs_invoice_status: "voided", hs_due_date: "2024-10-01", amount: "3000", dealId: "3", dealName: "Training Services" },
        ];
        
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
          message: "Mock data - HubSpot not connected"
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
          
          if (status.toLowerCase() === "open" && dueDate) {
            const dueDateObj = new Date(dueDate);
            if (dueDateObj < today) {
              overdueCount++;
            }
          }

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
              dealName = dealId ? (dealMap.get(dealId) || null) : null;
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
