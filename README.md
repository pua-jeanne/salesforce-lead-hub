This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Architecture documentation

See the [Salesforce Lead Hub architecture document](docs/PROJECT_GUIDE.md) for the system design, runtime flows,
component reference, Clerk and Convex authentication flows, Salesforce and Slack
integrations, environment setup, API reference, and local testing instructions.

## Clerk and Convex authentication

The existing Clerk application, `ClerkProvider`, `proxy.ts`, and sign-in/sign-up
routes are preserved. The client provider inside Clerk passes `useAuth` to
`ConvexProviderWithClerk`, following the
[official Convex guide](https://docs.convex.dev/auth/clerk#nextjs).

Keep these variables in `.env.local` and your Next.js hosting environment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Existing Clerk instance's publishable key |
| `CLERK_SECRET_KEY` | Existing Clerk secret key; server only |
| `NEXT_PUBLIC_CONVEX_URL` | Matching Convex deployment URL |
| `CONVEX_DEPLOYMENT` | Existing CLI deployment selection, maintained by Convex |

Keep the existing Clerk sign-in/sign-up URL and redirect variables as well.

In **Convex Dashboard → your deployment → Settings → Environment Variables**, set:

```text
CLERK_JWT_ISSUER_DOMAIN=https://your-instance.clerk.accounts.dev
```

Use the exact **Frontend API URL** from the existing Clerk application's API Keys
or Convex integration page, including `https://`. Do not use the sign-in URL,
publishable key, or Convex URL as the issuer. `convex/auth.config.ts` validates this
issuer and the `convex` audience (`applicationID`). No Clerk secret key is needed
in Convex. For a local backend, configure the same variable using
`npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev`.
Setting it only in Next.js's `.env.local` does not configure the backend.

Configure this variable separately on each Convex deployment. Development should
use the development Clerk instance; production should use its matching production
Frontend API URL (often `https://clerk.your-domain.com`) and matching Next.js Clerk
keys. After configuring it, run `npx convex dev` to sync local/development functions
and auth configuration. Production deployment is a separate release step.

To verify:

1. Run `npx convex dev` and `npm run dev` in separate terminals.
2. Open `http://localhost:3000/auth-test` while signed out. It should offer sign-in
   and must not display a verified identity.
3. Sign in with your existing Clerk application. The page should show
   **Success: Convex verified your Clerk identity.**, the matching Clerk user ID,
   and the configured issuer. Refresh to verify the session persists.
4. Sign out using the user menu. The verified identity should disappear.
5. Run `npx convex run authTest:viewer '{}'` without an identity. It should fail
   with **Not authenticated**, proving the backend rejects unauthenticated calls.

The test query derives identity from `ctx.auth.getUserIdentity()` and accepts no
user ID arguments. Its UI mounts only within Convex's `Authenticated` component,
so a Clerk session alone cannot produce a success result. It displays no tokens
or secrets and stores no data. If Clerk signs in but Convex does not authenticate,
check that the issuer matches the Clerk instance, the Clerk Convex integration is
active, the backend configuration has synced, and the frontend points at that backend.

Checks: `npm run lint`, `npx tsc --noEmit`, and `npm run build`. If Turbopack cannot
create its worker process in a restricted environment, try
`npm run build -- --webpack`. The existing Google fonts require network access.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
