// Determines whether a Clerk session can access protected Lead Hub routes.

import { auth } from "@clerk/nextjs/server";
import { isApprovedClerkUser } from "../../lib/approved-users";

export async function getLeadHubAccessStatus(): Promise<200 | 401 | 403> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return 401;
  return isApprovedClerkUser(userId) ? 200 : 403;
}
