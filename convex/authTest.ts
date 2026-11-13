import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";

// Identity comes only from the verified token, never from client arguments.
export const viewer = query({
  args: {},
  returns: v.object({ subject: v.string(), issuer: v.string() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Not authenticated");
    }
    return { subject: identity.subject, issuer: identity.issuer };
  },
});
