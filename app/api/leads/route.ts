// Serves Salesforce leads to signed-in users approved for Lead Hub.

import { getLeadHubAccessStatus } from "@/src/lib/authorization";
import { getSalesforceLeads, SalesforceError } from "@/lib/salesforce";
import type { LeadsResponse } from "@/lib/leads";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const accessStatus = await getLeadHubAccessStatus();
  if (accessStatus === 401) {
    return Response.json({ error: "Sign in to view Salesforce Leads." } satisfies LeadsResponse, { status: 401, headers });
  }

  if (accessStatus === 403) {
    return Response.json({ error: "You do not have access to Salesforce Lead Hub." }, { status: 403, headers });
  }

  try {
    const params = new URL(request.url).searchParams;
    const page = await getSalesforceLeads({
      search: params.get("search")?.trim() ?? "",
      status: params.get("status") ?? "",
      cursor: params.get("cursor"),
    });
    return Response.json(page satisfies LeadsResponse, { headers });
  } catch (error) {
    const message = error instanceof SalesforceError ? error.message : "Unable to load Salesforce Leads. Please try again.";
    const status = error instanceof SalesforceError ? error.status : 500;
    return Response.json({ error: message } satisfies LeadsResponse, { status, headers });
  }
}
