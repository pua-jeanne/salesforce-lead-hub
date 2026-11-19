import "server-only";

import { LEADS_PAGE_SIZE, LEAD_FILTER_MAX_LENGTH, type Lead, type LeadsPage } from "./leads";

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

async function getSalesforceConnection() {
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

  return { instanceOrigin, accessToken: token.access_token };
}

async function querySalesforce(
  { instanceOrigin, accessToken }: Awaited<ReturnType<typeof getSalesforceConnection>>,
  query: string,
): Promise<unknown[]> {
  const queryUrl = new URL("/services/data/v66.0/query", instanceOrigin);
  queryUrl.searchParams.set("q", query);
  const response = await salesforceFetch(queryUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
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

  return result.records;
}

const leadFields = "Id, Name, Company, Email, Status";
const leadIdPattern = /^00Q[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const cursorPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)\|(00Q[A-Za-z0-9]{15})$/;

function toLead(record: unknown): Lead {
  if (
    !isObject(record) || typeof record.Id !== "string" ||
    typeof record.Name !== "string" || typeof record.Company !== "string" ||
    typeof record.Status !== "string" ||
    (record.Email !== null && typeof record.Email !== "string")
  ) {
    throw new SalesforceError("Salesforce returned unexpected Lead fields. Check field access for the Run As user.");
  }
  return { id: record.Id, name: record.Name, company: record.Company, email: record.Email, status: record.Status };
}

function escapeSoql(value: string) {
  return value.replace(/[\\']/g, "\\$&");
}

export async function getSalesforceLeads({ search, status, cursor }: {
  search: string;
  status: string;
  cursor: string | null;
}): Promise<LeadsPage> {
  if ([search, status].some((value) => value.length > LEAD_FILTER_MAX_LENGTH || /[\x00-\x1f\x7f]/.test(value))) {
    throw new SalesforceError("Search and status must be valid single-line values.", 400);
  }

  const conditions: string[] = [];
  if (search) {
    const pattern = `'%${escapeSoql(search).replace(/[%_]/g, "\\$&")}%'`;
    conditions.push(`(Name LIKE ${pattern} OR Company LIKE ${pattern} OR Email LIKE ${pattern})`);
  }
  if (status) conditions.push(`Status = '${escapeSoql(status)}'`);
  if (cursor !== null) {
    const match = cursorPattern.exec(cursor);
    if (!match || match[0] !== cursor || !Number.isFinite(Date.parse(match[1]))) {
      throw new SalesforceError("Invalid lead page cursor. Refresh the results and try again.", 400);
    }
    const [, createdDate, id] = match;
    conditions.push(`(CreatedDate < ${createdDate} OR (CreatedDate = ${createdDate} AND Id < '${id}'))`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const connection = await getSalesforceConnection();
  const [records, statusRecords] = await Promise.all([
    querySalesforce(connection, `SELECT ${leadFields}, CreatedDate FROM Lead${where} ORDER BY CreatedDate DESC, Id DESC LIMIT ${LEADS_PAGE_SIZE + 1}`),
    cursor === null
      ? querySalesforce(connection, "SELECT Status FROM Lead GROUP BY Status ORDER BY Status")
      : Promise.resolve(null),
  ]);

  const leads = records.slice(0, LEADS_PAGE_SIZE).map(toLead);
  let nextCursor: string | null = null;
  if (records.length > LEADS_PAGE_SIZE) {
    const last = records[LEADS_PAGE_SIZE - 1];
    const createdDate = isObject(last) && typeof last.CreatedDate === "string" ? Date.parse(last.CreatedDate) : NaN;
    if (!Number.isFinite(createdDate)) throw new SalesforceError("Salesforce returned an invalid Lead creation date.");
    nextCursor = `${new Date(createdDate).toISOString().replace(".000Z", "Z")}|${leads[LEADS_PAGE_SIZE - 1].id}`;
    if (!cursorPattern.test(nextCursor)) throw new SalesforceError("Salesforce returned an invalid Lead page cursor.");
  }

  const statuses = statusRecords?.map((record) => {
    if (!isObject(record) || typeof record.Status !== "string") {
      throw new SalesforceError("Salesforce returned an invalid Lead status.");
    }
    return record.Status;
  });
  return { leads, nextCursor, statuses };
}

export async function getSalesforceLead(leadId: string): Promise<Lead | null> {
  if (!leadIdPattern.test(leadId) || /\s/.test(leadId)) throw new SalesforceError("Invalid Lead ID.", 400);
  const connection = await getSalesforceConnection();
  const [record] = await querySalesforce(connection, `SELECT ${leadFields} FROM Lead WHERE Id = '${leadId}' LIMIT 1`);
  return record === undefined ? null : toLead(record);
}
