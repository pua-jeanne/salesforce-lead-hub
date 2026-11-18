// Tests authorization on the Salesforce leads and Slack notification routes.

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/leads/route";
import { POST } from "../app/api/slack/notify/route";

const { auth, getSalesforceLeads, notifySlack } = vi.hoisted(() => ({
  auth: vi.fn(),
  getSalesforceLeads: vi.fn(),
  notifySlack: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/salesforce", () => ({ getSalesforceLeads }));
vi.mock("@/lib/slack", () => ({ notifySlack }));

const lead = { id: "00Q000000000001EAA" };

function notify() {
  return POST(new Request("https://example.com/api/slack/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId: lead.id }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ isAuthenticated: true, userId: "user_approved" });
  getSalesforceLeads.mockResolvedValue([lead]);
  vi.stubEnv("AUTHORIZED_CLERK_USER_IDS", " user_other, , user_approved ");
});

afterEach(() => vi.unstubAllEnvs());

describe.each([["leads", GET], ["Slack notification", notify]] as const)("%s route", (_, request) => {
  it("returns 401 for signed-out requests before calling external services", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });
    expect((await request()).status).toBe(401);
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it("returns 403 for signed-in users who lack an exact approval", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "user_approve" });
    const response = await request();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it.each([undefined, "", " , "])("fails closed with no approved IDs (%s)", async (value) => {
    vi.stubEnv("AUTHORIZED_CLERK_USER_IDS", value);
    expect((await request()).status).toBe(403);
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it("allows approved users to reach the existing Salesforce flow", async () => {
    expect((await request()).status).toBe(200);
    expect(getSalesforceLeads).toHaveBeenCalledOnce();
  });
});

it("sends Slack the lead loaded from Salesforce for an approved user", async () => {
  expect((await notify()).status).toBe(200);
  expect(notifySlack).toHaveBeenCalledExactlyOnceWith(lead);
});
