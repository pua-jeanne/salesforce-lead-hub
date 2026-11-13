import "server-only";

import type { Lead } from "./leads";

export class SalesforceError extends Error {
  constructor(message: string, public readonly status: number = 502) {
    super(message);
    this.name = "SalesforceError";
  }
}

function salesforceOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".salesforce.com") ||
    url.username || url.password || url.port ||
    url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("Invalid Salesforce origin");
  }
  return url.origin;
}

async function salesforceFetch(url: URL, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SalesforceError("Salesforce could not be reached or timed out. Please try again.");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SalesforceError("Salesforce returned an invalid response. Please try again.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getSalesforceLeads(): Promise<Lead[]> {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL?.trim();
  const clientId = process.env.SALESFORCE_CLIENT_ID?.trim();
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET?.trim();

  if (!loginUrl || !clientId || !clientSecret) {
    throw new SalesforceError(
      "Salesforce configuration is incomplete. Set SALESFORCE_LOGIN_URL, SALESFORCE_CLIENT_ID, and SALESFORCE_CLIENT_SECRET on the server.",
      503,
    );
  }

  let loginOrigin: string;
  try {
    loginOrigin = salesforceOrigin(loginUrl);
  } catch {
    throw new SalesforceError("SALESFORCE_LOGIN_URL must be your HTTPS Salesforce My Domain origin (without a path or query).", 503);
  }

  const tokenResponse = await salesforceFetch(new URL("/services/oauth2/token", loginOrigin), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    throw new SalesforceError("Salesforce OAuth authentication failed. Check the server credentials, My Domain URL, client credentials flow, and Run As user configuration.");
  }

  const token = await readJson(tokenResponse);
  if (!isObject(token) || typeof token.access_token !== "string" || !token.access_token || typeof token.instance_url !== "string") {
    throw new SalesforceError("Salesforce OAuth returned an invalid token response.");
  }

  let instanceOrigin: string;
  try {
    instanceOrigin = salesforceOrigin(token.instance_url);
  } catch {
    throw new SalesforceError("Salesforce OAuth returned an invalid instance URL.");
  }

  // Fixed query and field list keep this endpoint read-only and bounded.
  const queryUrl = new URL("/services/data/v66.0/query", instanceOrigin);
  queryUrl.searchParams.set("q", "SELECT Id, Name, Company, Email, Status FROM Lead ORDER BY CreatedDate DESC, Id DESC LIMIT 20");
  const response = await salesforceFetch(queryUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new SalesforceError("Salesforce rejected the access token. Retry to obtain a new token.");
    }
    if (response.status === 403) {
      throw new SalesforceError("Salesforce denied Lead access. Check the Run As user's API, Lead, and field permissions.");
    }
    if (response.status === 429) {
      throw new SalesforceError("Salesforce's request limit was reached. Please try again later.");
    }
    throw new SalesforceError("Salesforce could not query Leads. Check the Run As user's Lead and field permissions and Salesforce API availability.");
  }

  const result = await readJson(response);
  if (!isObject(result) || !Array.isArray(result.records)) {
    throw new SalesforceError("Salesforce returned an invalid Leads response.");
  }

  return result.records.slice(0, 20).map((record: unknown) => {
    if (
      !isObject(record) || typeof record.Id !== "string" ||
      typeof record.Name !== "string" || typeof record.Company !== "string" ||
      typeof record.Status !== "string" ||
      (record.Email !== null && typeof record.Email !== "string")
    ) {
      throw new SalesforceError("Salesforce returned unexpected Lead fields. Check field access for the Run As user.");
    }
    return { id: record.Id, name: record.Name, company: record.Company, email: record.Email, status: record.Status };
  });
}
