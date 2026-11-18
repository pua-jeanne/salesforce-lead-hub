// src/lib/authorization.ts
import { auth } from "@clerk/nextjs/server";

export async function isApprovedUser() {
  const { userId } = await auth();

  if (!userId) return false;

  const allowed = (
    process.env.AUTHORIZED_CLERK_USER_IDS ?? ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return allowed.includes(userId);
}