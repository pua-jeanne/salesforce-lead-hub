// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../app/api/leads/route";
import type { LeadsPage } from "../lib/leads";
import { getSalesforceLeads } from "../lib/salesforce";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ isAuthenticated: true, userId: "user_approved" }),
}));

const leadsUrl = "https://example.test/api/leads";

const fetchMock = vi.fn<typeof fetch>();
const records = Array.from({ length: 21 }, (_, index) => ({
  Id: "00Q" + String(21 - index).padStart(12, "0") + "EAA",
  Name: "Example",
  Company: "Acme",
  Email: null,
  Status: "New",
  CreatedDate: "2026-11-19T00:00:00.000+0000",
}));

function soql(call: number) {
  return new URL(String(fetchMock.mock.calls[call][0])).searchParams.get("q");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AUTHORIZED_CLERK_USER_IDS", "user_approved");
  vi.stubEnv("SALESFORCE_LOGIN_URL", "https://example.salesforce.com");
  vi.stubEnv("SALESFORCE_CLIENT_ID", "mock-client");
  vi.stubEnv("SALESFORCE_CLIENT_SECRET", "mock-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mockToken() {
  fetchMock.mockResolvedValueOnce(Response.json({
    access_token: "mock-token",
    instance_url: "https://example.salesforce.com",
  }));
}

it("uses a lookahead row and resumes after the last displayed lead, including ties", async () => {
  mockToken();
  fetchMock
    .mockResolvedValueOnce(Response.json({ records }))
    .mockResolvedValueOnce(Response.json({ records: [{ Status: "New" }, { Status: "Working" }] }));
  const params = new URLSearchParams({ search: "Acme", status: "New" });
  const firstResponse = await GET(new Request(`${leadsUrl}?${params}`));
  expect(firstResponse.status).toBe(200);
  const first: LeadsPage = await firstResponse.json();
  expect(first.nextCursor).toBeTruthy();
  expect(first.leads.map((lead) => lead.id)).toEqual(records.slice(0, 20).map((record) => record.Id));
  expect(first.statuses).toEqual(["New", "Working"]);
  expect(soql(1)).toContain("ORDER BY CreatedDate DESC, Id DESC LIMIT 21");

  mockToken();
  fetchMock.mockResolvedValueOnce(Response.json({ records: records.slice(20) }));
  params.set("cursor", first.nextCursor!);
  const secondResponse = await GET(new Request(`${leadsUrl}?${params}`));
  expect(secondResponse.status).toBe(200);
  const second: LeadsPage = await secondResponse.json();
  expect(soql(4)).toContain("AND (CreatedDate < 2026-11-19T00:00:00Z OR (CreatedDate = 2026-11-19T00:00:00Z AND Id < '" + records[19].Id + "'))");
  expect(soql(4)).toContain("Company LIKE '%Acme%'");
  expect(soql(4)).toContain("Status = 'New'");
  expect(second.leads.map((lead) => lead.id)).toEqual([records[20].Id]);
  expect(second.nextCursor).toBeNull();
});

it("treats quotes, backslashes and wildcard characters as literal filter text", async () => {
  mockToken();
  fetchMock
    .mockResolvedValueOnce(Response.json({ records: [] }))
    .mockResolvedValueOnce(Response.json({ records: [] }));
  await getSalesforceLeads({ search: "O'Reilly_50%\\", status: "Client's lead", cursor: null });
  expect(soql(1)).toContain("Name LIKE '%O\\'Reilly\\_50\\%\\\\%'");
  expect(soql(1)).toContain("Status = 'Client\\'s lead'");
});

it.each(["invalid", "https://example.salesforce.com/services/data/v66.0/query/locator"])(
  "rejects a malformed cursor (%s) before calling Salesforce",
  async (cursor) => {
    await expect(getSalesforceLeads({ search: "", status: "", cursor }))
      .rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);


it("returns a private 400 response without calling Salesforce when the page cursor is invalid", async () => {
  const response = await GET(new Request(`${leadsUrl}?cursor=invalid`));

  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  await expect(response.json()).resolves.toEqual({
    error: "Invalid lead page cursor. Refresh the results and try again.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns a safe error when Salesforce rate-limits a later page", async () => {
  mockToken();
  fetchMock.mockResolvedValueOnce(new Response("Upstream diagnostic", { status: 429 }));
  const params = new URLSearchParams({ cursor: `2026-11-19T00:00:00Z|${records[19].Id}` });

  const response = await GET(new Request(`${leadsUrl}?${params}`));

  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toEqual({
    error: "Salesforce's request limit was reached. Please try again later.",
  });
});
