import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";
import { isApprovedClerkUser } from "./approved-users";

export async function requireApprovedClerkIdentity(auth: Auth, signInMessage: string) {
  const identity = await auth.getUserIdentity();
  if (!identity) throw new ConvexError(signInMessage);
  if (!isApprovedClerkUser(identity.subject)) {
    throw new ConvexError("You do not have access to Salesforce Lead Hub.");
  }
  return identity;
}
