// Tests authorization on the Salesforce leads and Slack notification routes.

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";
import { GET } from "../app/api/leads/route";
import { POST } from "../app/api/slack/notify/route";

const { auth, getSalesforceLeads, getSalesforceLead, notifySlack } = vi.hoisted(() => ({
  auth: vi.fn(),
  getSalesforceLeads: vi.fn(),
  getSalesforceLead: vi.fn(),
  notifySlack: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("../app/components/lead-dashboard", () => ({ default: () => "Lead Dashboard" }));
vi.mock("@/lib/salesforce", () => ({ getSalesforceLeads, getSalesforceLead }));
vi.mock("@/lib/slack", () => ({ notifySlack }));

const lead = { id: "00Q000000000001EAA" };
const page = { leads: [lead], nextCursor: null };
const getLeads = (query = "") => GET(new Request(`https://example.com/api/leads${query}`));

function notify(origin?: string) {
  return POST(new Request("https://example.com/api/slack/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ leadId: lead.id }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ isAuthenticated: true, userId: "user_approved" });
  getSalesforceLeads.mockResolvedValue(page);
  getSalesforceLead.mockResolvedValue(lead);
  vi.stubEnv("AUTHORIZED_CLERK_USER_IDS", " user_other, , user_approved ");
});

afterEach(() => vi.unstubAllEnvs());

describe("dashboard", () => {
  it("redirects signed-out users to Clerk sign-in", async () => {
    const redirectToSignIn = vi.fn(() => { throw new Error("Clerk sign-in redirect"); });
    auth.mockResolvedValue({ isAuthenticated: false, userId: null, redirectToSignIn });

    await expect(Home()).rejects.toThrow("Clerk sign-in redirect");
    expect(redirectToSignIn).toHaveBeenCalledOnce();
  });

  it("shows Access Denied without rendering the dashboard for an unapproved user", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "user_unapproved" });

    const page = renderToStaticMarkup(await Home());
    expect(page).toContain("403 Access Denied");
    expect(page).not.toContain("Lead Dashboard");
  });

  it("renders the dashboard for an approved user", async () => {
    expect(renderToStaticMarkup(await Home())).toContain("Lead Dashboard");
  });
});

describe.each([["leads", getLeads], ["Slack notification", notify]] as const)("%s route", (_, request) => {
  it("returns 401 for signed-out requests before calling external services", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });
    expect((await request()).status).toBe(401);
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(getSalesforceLead).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it("returns 403 for signed-in users who lack an exact approval", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "user_approve" });
    const response = await request();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(getSalesforceLead).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it.each([undefined, "", " , "])("fails closed with no approved IDs (%s)", async (value) => {
    vi.stubEnv("AUTHORIZED_CLERK_USER_IDS", value);
    expect((await request()).status).toBe(403);
    expect(getSalesforceLeads).not.toHaveBeenCalled();
    expect(getSalesforceLead).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });
});

it("sends Slack the lead loaded from Salesforce for an approved user", async () => {
  expect((await notify()).status).toBe(200);
  expect(getSalesforceLead).toHaveBeenCalledExactlyOnceWith(lead.id);
  expect(notifySlack).toHaveBeenCalledExactlyOnceWith(lead);
});

it("returns the Salesforce leads to an approved user", async () => {
  const response = await getLeads("?search=Acme&status=New&cursor=next");
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual(page);
  expect(getSalesforceLeads).toHaveBeenCalledExactlyOnceWith({ search: "Acme", status: "New", cursor: "next" });
});


it("rejects cross-origin Slack notifications before contacting Salesforce or Slack", async () => {
  expect((await notify("https://other.example")).status).toBe(403);
  expect(getSalesforceLead).not.toHaveBeenCalled();
  expect(notifySlack).not.toHaveBeenCalled();
});

it("returns 404 without posting when Salesforce no longer returns the lead", async () => {
  getSalesforceLead.mockResolvedValue(null);

  expect((await notify()).status).toBe(404);
  expect(notifySlack).not.toHaveBeenCalled();
});
