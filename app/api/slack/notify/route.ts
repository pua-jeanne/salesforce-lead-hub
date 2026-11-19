// Lets approved users send a Slack notification for a Salesforce lead.

import { getLeadHubAccessStatus } from "@/src/lib/authorization";
import { getSalesforceLead, SalesforceError } from "@/lib/salesforce";
import { notifySlack, SlackError } from "@/lib/slack";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const accessStatus = await getLeadHubAccessStatus();
  if (accessStatus === 401) {
    return Response.json({ error: "Sign in to notify Slack." }, { status: 401, headers });
  }

  if (accessStatus === 403) {
    return Response.json({ error: "You do not have access to Salesforce Lead Hub." }, { status: 403, headers });
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers });
  }
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    return Response.json({ error: "Send an application/json request." }, { status: 415, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400, headers });
  }
  if (
    typeof body !== "object" || body === null || !("leadId" in body) ||
    typeof body.leadId !== "string" || !/^00Q[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(body.leadId)
  ) {
    return Response.json({ error: "A valid Salesforce Lead ID is required." }, { status: 400, headers });
  }

  try {
    // Resolve current Lead fields on the server instead of trusting browser content.
    const lead = await getSalesforceLead(body.leadId);
    if (!lead) {
      return Response.json({ error: "Lead is no longer visible in Salesforce. Refresh the dashboard and try again." }, { status: 404, headers });
    }
    await notifySlack(lead);
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof SlackError || error instanceof SalesforceError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    return Response.json({ error: "Unable to notify Slack. Please try again." }, { status: 500, headers });
  }
}
