import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leadNotes: defineTable({
    salesforceLeadId: v.string(),
    clerkUserId: v.string(),
    ownerIdentity: v.string(),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerIdentity_and_salesforceLeadId", [
    "ownerIdentity",
    "salesforceLeadId",
  ]),
});
