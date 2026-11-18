// Checks a Clerk user ID against the allowlist shared by Next.js and Convex.

export function isApprovedClerkUser(userId: string): boolean {
  return userId !== "" && (process.env.AUTHORIZED_CLERK_USER_IDS ?? "")
    .split(",")
    .some((id) => id.trim() === userId);
}
