import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Set to this Clerk instance's Frontend API URL in the Convex Dashboard.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
