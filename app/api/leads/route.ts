import { auth } from "@clerk/nextjs/server";
import { getSalesforceLeads, SalesforceError } from "@/lib/salesforce";
import type { LeadsResponse } from "@/lib/leads";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) {
    return Response.json({ error: "Sign in to view Salesforce Leads." } satisfies LeadsResponse, { status: 401, headers });
  }

  try {
    const leads = await getSalesforceLeads();
    return Response.json({ leads } satisfies LeadsResponse, { headers });
  } catch (error) {
    const message = error instanceof SalesforceError ? error.message : "Unable to load Salesforce Leads. Please try again.";
    const status = error instanceof SalesforceError ? error.status : 500;
    return Response.json({ error: message } satisfies LeadsResponse, { status, headers });
  }
}
