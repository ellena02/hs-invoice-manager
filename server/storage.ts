import type { HubspotToken, InsertHubspotToken } from "@shared/schema";

export interface IStorage {
  getToken(portalId: string): Promise<HubspotToken | null>;
  saveToken(token: InsertHubspotToken): Promise<void>;
  deleteToken(portalId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private tokens: Map<string, HubspotToken> = new Map();

  async getToken(portalId: string): Promise<HubspotToken | null> {
    return this.tokens.get(portalId) || null;
  }

  async saveToken(token: InsertHubspotToken): Promise<void> {
    this.tokens.set(token.portalId, {
      ...token,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async deleteToken(portalId: string): Promise<void> {
    this.tokens.delete(portalId);
  }
}

export const storage = new MemStorage();
