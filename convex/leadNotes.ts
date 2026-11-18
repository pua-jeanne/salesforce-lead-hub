//Save Lead Notes to Convex
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { MAX_NOTE_LENGTH } from "../lib/note-limits";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to manage your notes.");
  return identity;
}

function validateLeadId(leadId: string) {
  if (!/^00Q[a-zA-Z0-9]{12}([a-zA-Z0-9]{3})?$/.test(leadId)) {
    throw new ConvexError("A valid Salesforce Lead record ID is required.");
  }
}

function validateContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_NOTE_LENGTH) {
    throw new ConvexError(`Notes must contain 1–${MAX_NOTE_LENGTH} characters after trimming.`);
  }
  return trimmed;
}

async function requireOwnedNote(ctx: MutationCtx, noteId: Id<"leadNotes">) {
  const identity = await requireIdentity(ctx);
  const note = await ctx.db.get("leadNotes", noteId);
  // Use the same error for an absent note and another user's note.
  if (!note || note.ownerIdentity !== identity.tokenIdentifier || note.clerkUserId !== identity.subject) {
    throw new ConvexError("Note not found or access denied.");
  }
  return note;
}

export const list = query({
  args: { salesforceLeadId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("leadNotes")),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    validateLeadId(args.salesforceLeadId);
    return await ctx.db.query("leadNotes")
      .withIndex("by_ownerIdentity_and_salesforceLeadId", (q) =>
        q.eq("ownerIdentity", identity.tokenIdentifier).eq("salesforceLeadId", args.salesforceLeadId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: { salesforceLeadId: v.string(), content: v.string() },
  returns: v.id("leadNotes"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    validateLeadId(args.salesforceLeadId);
    const content = validateContent(args.content);
    const now = Date.now();
    return await ctx.db.insert("leadNotes", {
      salesforceLeadId: args.salesforceLeadId,
      clerkUserId: identity.subject,
      ownerIdentity: identity.tokenIdentifier,
      content,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { noteId: v.id("leadNotes"), content: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await requireOwnedNote(ctx, args.noteId);
    await ctx.db.patch("leadNotes", note._id, {
      content: validateContent(args.content),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { noteId: v.id("leadNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await requireOwnedNote(ctx, args.noteId);
    await ctx.db.delete("leadNotes", note._id);
    return null;
  },
});
