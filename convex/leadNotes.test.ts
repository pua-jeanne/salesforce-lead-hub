/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const leadId = "00Q000000000001EAA";
const otherLeadId = "00Q000000000002EAA";
const alice = { subject: "user_alice", issuer: "https://clerk.example", tokenIdentifier: "https://clerk.example|user_alice" };
const bob = { subject: "user_bob", issuer: "https://clerk.example", tokenIdentifier: "https://clerk.example|user_bob" };
const paginationOpts = { numItems: 10, cursor: null };

describe("lead notes", () => {
  it("persists CRUD with verified ownership and scopes reads to the Lead", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(alice);
    const noteId = await user.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "  Follow up tomorrow  " });
    const saved = await t.run((ctx) => ctx.db.get("leadNotes", noteId));
    expect(saved).toMatchObject({ salesforceLeadId: leadId, clerkUserId: alice.subject, ownerIdentity: alice.tokenIdentifier, content: "Follow up tomorrow" });
    expect(saved?.createdAt).toBeTypeOf("number");
    expect(saved?.updatedAt).toBe(saved?.createdAt);

    // A new authenticated client reads the same persisted record.
    const reconnected = t.withIdentity(alice);
    const listed = await reconnected.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts });
    expect(listed.page.map((note) => note._id)).toEqual([noteId]);
    expect((await user.query(api.leadNotes.list, { salesforceLeadId: otherLeadId, paginationOpts })).page).toEqual([]);
    await user.mutation(api.leadNotes.update, { noteId, content: "Updated follow-up" });
    const updated = await t.run((ctx) => ctx.db.get("leadNotes", noteId));
    expect(updated?.content).toBe("Updated follow-up");
    expect(updated?.createdAt).toBe(saved?.createdAt);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(saved!.updatedAt);
    await user.mutation(api.leadNotes.remove, { noteId });
    expect((await user.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts })).page).toEqual([]);
  });

  it("denies another user and a different issuer even when they know the note ID", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(alice);
    const stranger = t.withIdentity(bob);
    const noteId = await owner.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "Private note" });
    expect((await stranger.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts })).page).toEqual([]);
    await expect(stranger.mutation(api.leadNotes.update, { noteId, content: "Stolen" })).rejects.toThrow("Note not found or access denied");
    await expect(stranger.mutation(api.leadNotes.remove, { noteId })).rejects.toThrow("Note not found or access denied");

    const differentIssuer = t.withIdentity({ subject: alice.subject, issuer: "https://other.example", tokenIdentifier: "https://other.example|user_alice" });
    expect((await differentIssuer.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts })).page).toEqual([]);
    await expect(differentIssuer.mutation(api.leadNotes.update, { noteId, content: "Stolen" })).rejects.toThrow("Note not found or access denied");
    await expect(differentIssuer.mutation(api.leadNotes.remove, { noteId })).rejects.toThrow("Note not found or access denied");
    expect((await owner.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts })).page[0].content).toBe("Private note");
  });

  it("rejects unauthenticated reads and every write", async () => {
    const t = convexTest(schema, modules);
    const noteId = await t.withIdentity(alice).mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "Private" });
    await expect(t.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts })).rejects.toThrow("Sign in");
    await expect(t.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "Anonymous" })).rejects.toThrow("Sign in");
    await expect(t.mutation(api.leadNotes.update, { noteId, content: "Anonymous" })).rejects.toThrow("Sign in");
    await expect(t.mutation(api.leadNotes.remove, { noteId })).rejects.toThrow("Sign in");
  });

  it("validates note content and Lead IDs on the server", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(alice);
    for (const content of ["", "   \n", "a".repeat(5001)]) {
      await expect(user.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content })).rejects.toThrow("Notes must contain");
    }
    for (const salesforceLeadId of ["", "lead-001", "001000000000001EAA"]) {
      await expect(user.mutation(api.leadNotes.create, { salesforceLeadId, content: "Note" })).rejects.toThrow("valid Salesforce Lead");
      await expect(user.query(api.leadNotes.list, { salesforceLeadId, paginationOpts })).rejects.toThrow("valid Salesforce Lead");
    }
    const noteId = await user.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "a".repeat(5000) });
    await expect(user.mutation(api.leadNotes.update, { noteId, content: "   " })).rejects.toThrow("Notes must contain");
    await expect(user.mutation(api.leadNotes.update, { noteId, content: "a".repeat(5001) })).rejects.toThrow("Notes must contain");
  });

  it("paginates without exposing another user's notes", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(alice);
    const stranger = t.withIdentity(bob);
    await stranger.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: "Bob's private note" });
    for (let index = 0; index < 12; index++) {
      await owner.mutation(api.leadNotes.create, { salesforceLeadId: leadId, content: `Alice note ${index}` });
    }
    const first = await owner.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts });
    expect(first.page).toHaveLength(10);
    expect(first.isDone).toBe(false);
    const second = await owner.query(api.leadNotes.list, { salesforceLeadId: leadId, paginationOpts: { numItems: 10, cursor: first.continueCursor } });
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(true);
    expect([...first.page, ...second.page].every((note) => note.clerkUserId === alice.subject)).toBe(true);
  });
});
