// Verifies that Convex receives the expected Clerk identity for an approved user.

import { v } from "convex/values";
import { requireApprovedClerkIdentity } from "../lib/convex-authorization";
import { query } from "./_generated/server";

// Identity comes only from the verified token, never from client arguments.
export const viewer = query({
  args: {},
  returns: v.object({ subject: v.string(), issuer: v.string() }),
  handler: async (ctx) => {
    const identity = await requireApprovedClerkIdentity(ctx.auth, "Not authenticated");
    return { subject: identity.subject, issuer: identity.issuer };
  },
});
