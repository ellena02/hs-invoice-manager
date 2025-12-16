import fs from "fs";
import path from "path";

const FILE = process.env.TOKEN_STORE_PATH
  ? process.env.TOKEN_STORE_PATH
  : path.join(process.cwd(), "token-store.json");

// Za “samo moj portal” – čuvamo 1 set tokena.
export type HubSpotTokens = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  [k: string]: any;
};

export function loadTokens(): HubSpotTokens | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return null;
  }
}

export function saveTokens(tokens: HubSpotTokens) {
  fs.writeFileSync(FILE, JSON.stringify(tokens, null, 2));
}
