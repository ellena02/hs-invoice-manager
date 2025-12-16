import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { Client as HubSpotClient } from "@hubspot/api-client";
import "express-session";

import {
  markBadDebtRequestSchema,
  markInvoiceBadDebtRequestSchema,
} from "@shared/schema";
import { storage } from "./storage";

/**
 * Extend express-session typing so TypeScript knows about portalId in session.
 */
declare module "express-session" {
  interface SessionData {
    portalId?: string;
  }
}

// OAuth Configuration
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI =
  process.env.HUBSPOT_REDIRECT_URI ||
  "http://localhost:5000/auth/hubspot/callback";

const HUBSPOT_SCOPES =
  "oauth crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.invoices.read crm.objects.invoices.write";

// Optional: private app token fallback (if you still want it)
const HS_PRIVATE_APP_TOKEN = process.env.HS_PRIVATE_APP_TOKEN;

// OAuth state storage for CSRF protection (in production, consider session/Redis)
const oauthStates = new Map<string, { createdAt: number }>();

function cleanupOAuthStates() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const keysToDelete: string[] = [];

  oauthStates.forEach((data, state) => {
    if (data.createdAt < tenMinutesAgo) keysToDelete.push(state);
  });

  for (let i = 0; i < keysToDelete.length; i++) {
    oauthStates.delete(keysToDelete[i]);
  }
}
function generateOAuthState(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let state = "";
  for (let i = 0; i < 32; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}

/**
 * Prefer portalId from session; allow fallback to query for backwards compatibility.
 */
function getPortalId(req: Request): string | undefined {
  return req.session?.portalId || (req.query.portalId as string | undefined);
}

function notConnected(res: Response) {
  return res.status(401).json({
    success: false,
    message: "Not connected to HubSpot. Please connect the app.",
  });
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

// Helper to get HubSpot client for a portal (OAuth first, optional private token fallback)
async function getHubSpotClient(portalId?: string): Promise<HubSpotClient | null> {
  if (portalId) {
    const token = await storage.getToken(portalId);
    if (token) {
      const now = Math.floor(Date.now() / 1000);
      if (token.expiresAt <= now + 60) {
        const refreshed = await refreshAccessToken(token.refreshToken, portalId);
        if (!refreshed) return null;
        return new HubSpotClient({ accessToken: refreshed.accessToken });
      }
      return new HubSpotClient({ accessToken: token.accessToken });
    }
  }

  if (HS_PRIVATE_APP_TOKEN) {
    return new HubSpotClient({ accessToken: HS_PRIVATE_APP_TOKEN });
  }

  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  /**
   * OAuth: Start authorization flow
   */
  app.get("/auth/hubspot", (_req: Request, res: Response) => {
    if (!HUBSPOT_CLIENT_ID) {
      return res.status(500).json({
        error: "OAuth not configured. Set HUBSPOT_CLIENT_ID env var.",
      });
    }

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

  /**
   * OAuth: Handle callback
   */
  app.get("/auth/hubspot/callback", async (req: Request, res: Response) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      return res.status(400).json({
        error: error as string,
        description: error_description as string,
      });
    }

    if (!state || typeof state !== "string" || !oauthStates.has(state)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing state parameter" });
    }
    oauthStates.delete(state);

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
      return res.status(500).json({
        error:
          "OAuth not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET.",
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
      const tokenInfo = await hubspotClient.oauth.accessTokensApi.get(
        tokenResult.accessToken
      );
      const portalId = tokenInfo.hubId?.toString();

      if (!portalId) {
        return res.status(500).json({ error: "Could not resolve portalId (hubId)" });
      }

      await storage.saveToken({
        portalId,
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokenResult.expiresIn,
      });

      // ✅ Save portalId into session so your modal/backend calls work without query params
      req.session.portalId = portalId;

      // Redirect back to your app (no portalId needed in URL)
      res.redirect(`/?connected=true`);
    } catch (err: any) {
      console.error("OAuth callback error:", err?.response?.body || err);
      res.status(500).json({
        error: "Failed to exchange authorization code",
        details: err?.response?.body?.message || err?.message,
      });
    }
  });

  /**
   * Check OAuth status
   */
  app.get("/auth/status", async (req: Request, res: Response) => {
    const portalId = getPortalId(req);

    if (portalId) {
      const token = await storage.getToken(portalId);
      if (token) {
        const now = Math.floor(Date.now() / 1000);
        return res.json({
          connected: true,
          portalId,
          expiresIn: token.expiresAt - now,
          oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET),
        });
      }
    }

    return res.json({
      connected: false,
      oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET),
      privateAppMode: !!HS_PRIVATE_APP_TOKEN,
    });
  });

  /**
   * Disconnect/logout
   */
  app.post("/auth/disconnect", async (req: Request, res: Response) => {
    const portalId = getPortalId(req);
    if (portalId) await storage.deleteToken(portalId);

    req.session.portalId = undefined;
    res.json({ success: true });
  });

  /**
   * Health
   */
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      oauthConfigured: !!(HUBSPOT_CLIENT_ID && HUBSPOT_CLIENT_SECRET),
      privateAppConfigured: !!HS_PRIVATE_APP_TOKEN,
    });
  });

  /**
   * Mark company bad debt
   */
  app.post("/api/mark-bad-debt", async (req, res) => {
    try {
      const parseResult = markBadDebtRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message:
            parseResult.error.errors[0]?.message || "Invalid request body",
        });
      }

      const { companyId, badDebt } = parseResult.data;
      const portalId = getPortalId(req);

      const hubspotClient = await getHubSpotClient(portalId);
      if (!hubspotClient) return notConnected(res);

      const isChecked =
        badDebt === true || badDebt === "true" || badDebt === 1 || badDebt === "1";
      const newValue = isChecked ? "true" : "false";

      await hubspotClient.crm.companies.basicApi.update(companyId, {
        properties: { bad_debt: newValue },
      });

      return res.status(200).json({ success: true, bad_debt: newValue });
    } catch (err: any) {
      console.error("Backend mark-bad-debt error:", err?.response?.body || err);
      return res.status(500).json({
        success: false,
        message:
          err?.response?.body?.message ||
          err?.message ||
          "Unexpected backend error.",
      });
    }
  });

  /**
   * Mark bad debt on specific invoice (cascades to deal and company)
   */
  app.post("/api/mark-invoice-bad-debt", async (req, res) => {
    try {
      const parseResult = markInvoiceBadDebtRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message:
            parseResult.error.errors[0]?.message || "Invalid request body",
        });
      }

      const { companyId, invoiceId, dealId } = parseResult.data;
      const portalId = getPortalId(req);

      const hubspotClient = await getHubSpotClient(portalId);
      if (!hubspotClient) return notConnected(res);

      const updates: string[] = [];
      let updatedInvoice = false;
      let updatedDeal = false;
      let updatedCompany = false;

      // 1) Invoice
      try {
        await hubspotClient.crm.objects.basicApi.update("invoices", invoiceId, {
          properties: { bad_debt: "true" },
        });
        updatedInvoice = true;
        updates.push("invoice");
      } catch (e: any) {
        console.error("Failed to update invoice bad_debt:", e?.response?.body || e);
      }

      // 2) Deal
      if (dealId) {
        try {
          await hubspotClient.crm.deals.basicApi.update(dealId, {
            properties: { bad_debt: "true" },
          });
          updatedDeal = true;
          updates.push("deal");
        } catch (e: any) {
          console.error("Failed to update deal bad_debt:", e?.response?.body || e);
        }
      }

      // 3) Company
      try {
        await hubspotClient.crm.companies.basicApi.update(companyId, {
          properties: { bad_debt: "true" },
        });
        updatedCompany = true;
        updates.push("company");
      } catch (e: any) {
        console.error("Failed to update company bad_debt:", e?.response?.body || e);
      }

      return res.status(200).json({
        success: true,
        bad_debt: "true",
        updatedInvoice,
        updatedDeal,
        updatedCompany,
        message:
          updates.length > 0
            ? `Marked bad debt on: ${updates.join(", ")}`
            : "No records were updated",
      });
    } catch (err: any) {
      console.error(
        "Backend mark-invoice-bad-debt error:",
        err?.response?.body || err
      );
      return res.status(500).json({
        success: false,
        message:
          err?.response?.body?.message ||
          err?.message ||
          "Unexpected backend error.",
      });
    }
  });

  /**
   * Get company + associated deals/invoices summary (real data only)
   */
  app.get("/api/company/:companyId", async (req, res) => {
    try {
      const { companyId } = req.params;
      const portalId = getPortalId(req);

      const hubspotClient = await getHubSpotClient(portalId);
      if (!hubspotClient) return notConnected(res);

      const companyResponse =
        await hubspotClient.crm.companies.basicApi.getById(companyId, [
          "name",
          "bad_debt",
        ]);

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

      const deals: any[] = [];
      for (const assoc of dealsResponse.results || []) {
        try {
          const deal = await hubspotClient.crm.deals.basicApi.getById(assoc.id, [
            "dealname",
            "amount",
            "dealstage",
            "closedate",
            "bad_debt",
          ]);
          deals.push({
            id: deal.id,
            dealname: deal.properties.dealname || "",
            amount: deal.properties.amount || null,
            dealstage: deal.properties.dealstage || "",
            closedate: deal.properties.closedate || null,
            bad_debt: deal.properties.bad_debt || null,
          });
        } catch (e) {
          console.error(`Failed to fetch deal ${assoc.id}:`, e);
        }
      }

      const dealMap = new Map<string, string>();
      for (const deal of deals) dealMap.set(deal.id, deal.dealname);

      const invoices: any[] = [];
      let overdueCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const assoc of invoicesResponse.results || []) {
        try {
          const invoice = await hubspotClient.crm.objects.basicApi.getById(
            "invoices",
            assoc.id,
            ["hs_invoice_number", "hs_invoice_status", "hs_due_date", "amount", "bad_debt"]
          );

          const status = invoice.properties.hs_invoice_status || "";
          const dueDate = invoice.properties.hs_due_date || null;
          if (status.toLowerCase() === "open" && dueDate) {
            if (new Date(dueDate) < today) overdueCount++;
          }

          let dealId: string | null = null;
          let dealName: string | null = null;

          try {
            const invoiceDealAssoc = await (hubspotClient.crm.associations.v4.basicApi as any).getPage(
              "invoices",
              assoc.id,
              "deals"
            );
            if (invoiceDealAssoc.results?.length) {
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
          } catch {
            // invoice may have no deal association
          }

          invoices.push({
            id: invoice.id,
            hs_invoice_number: invoice.properties.hs_invoice_number || "",
            hs_invoice_status: status,
            hs_due_date: dueDate,
            amount: invoice.properties.amount || null,
            dealId,
            dealName,
            bad_debt: invoice.properties.bad_debt || null,
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
    } catch (err: any) {
      console.error("Error fetching company data:", err?.response?.body || err);
      return res.status(500).json({
        success: false,
        message:
          err?.response?.body?.message ||
          err?.message ||
          "Failed to fetch company data",
      });
    }
  });

  return httpServer;
}
