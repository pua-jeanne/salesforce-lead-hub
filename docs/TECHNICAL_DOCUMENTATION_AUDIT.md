# Salesforce Lead Hub technical documentation audit

**Baseline:** Local branch `feature/runtestsinvercel`, commit `feaf1f0`, reviewed November 21, 2026 (Asia/Manila).

**Scope:** Static review of authored application, integration, test, and deployment-related files. The [project guide](PROJECT_GUIDE.md) and [README](../README.md) were the documentation baseline. Generated directories, dependency trees, local environment files, and deployment metadata were excluded. External dashboard settings and live deployment outcomes were not checked. No builds, test runs, or live requests to project services were performed for this audit.

## Verified architecture

Salesforce Lead Hub is one Next.js App Router application built with React. The root layout and homepage are server components. The dashboard, note dialog, Slack button, Convex provider, and auth diagnostic use React client components within the same Next.js app. The repository-root `app/` owns routes and UI, `lib/` holds shared helpers and integrations, `src/lib/` holds the Next.js access helper, `convex/` holds backend functions and schema, and `tests/` holds application tests. Salesforce is the source of Lead data, Convex persists user-owned notes, and Slack receives a copy of selected Lead fields.

### Clerk authentication and application approval

1. `RootLayout` mounts `ClerkProvider` and then `ConvexClientProvider`. Root `proxy.ts` runs Clerk middleware on matched requests. The homepage and protected Route Handlers enforce their own checks using `getLeadHubAccessStatus()`.
2. The helper calls Clerk `auth()`, requires an authenticated session with a user ID, and compares the exact ID with the trimmed comma-separated entries in `AUTHORIZED_CLERK_USER_IDS`. Missing or blank configuration grants no access. The homepage redirects signed-out callers to Clerk and renders an Access Denied screen for unapproved callers. The two API handlers explicitly return HTTP `401` or `403`, respectively. The page's “403 Access Denied” heading does not establish an HTTP status.
3. In the browser, `ConvexProviderWithClerk` connects Clerk's `useAuth` to a `ConvexReactClient` using `NEXT_PUBLIC_CONVEX_URL`. Convex validates the Clerk token against the configured issuer and the `convex` application ID. The Convex functions then check the verified `identity.subject` against their own environment's allowlist.
4. Clerk `SignIn` and `SignUp` render in catch-all App Router pages. The guide specifies Invite-only admission. Its active setting, instance, and invitation policies live in Clerk and cannot be established by the presence of these pages. `/auth-test` waits for Convex authentication and invokes `authTest.viewer`, which returns the approved caller's subject and issuer.

### React dashboard → Next.js → Salesforce

1. `LeadDashboard` calls `GET /api/leads` with optional `search`, `status`, and `cursor`. Filters reset the list and cursor. Load More resends the active filters plus the returned cursor, appends results, and deduplicates by Lead ID. Summary counts describe loaded rows.
2. The Route Handler checks session and approval before calling the server-only helper. The helper validates filters (120-character maximum and no control characters), escapes SOQL string and search wildcard characters, and accepts only the app's timestamp-and-Lead-ID cursor format. Invalid inputs return `400` before Salesforce requests.
3. Each helper invocation exchanges OAuth 2.0 client credentials at the configured Salesforce My Domain token endpoint. It validates both login and OAuth-returned instance origins as HTTPS under `.salesforce.com`. It uses the returned access token as a bearer credential for REST API `v66.0` on the returned instance. Fetch rejects redirects, uses no-store, and has a 15-second timeout per request.
4. The SOQL query searches Name, Company, or Email, filters exact Status when supplied, and orders by `CreatedDate DESC, Id DESC`. It fetches up to 21 rows and returns up to 20. The extra row determines whether to emit a cursor based on the last displayed row. The first page also runs a grouped status query in parallel with the page query, independent of the current filters. Later pages omit `statuses`. A null `nextCursor` ends pagination.
5. The browser receives `{ leads, nextCursor, statuses? }` or a safe error, with `Cache-Control: private, no-store`. Mapped Lead fields are ID, name, company, nullable email, and status. Missing or invalid integration configuration returns `503`. Salesforce OAuth, transport, query, and response failures normally return `502`. Salesforce permissions are those of the External Client App's configured Run As user.

### React notes → Convex → database

The note dialog uses the Convex React client directly. Its subscription calls `leadNotes.list` with the selected Salesforce ID and Convex pagination options, initially requesting 10 notes; Load More requests 10 additional notes. The browser calls `create`, `update`, and `remove` mutations through the same client. The dialog waits for Convex auth and a Clerk user ID, and the functions enforce approval independently.

The `leadNotes` table stores `salesforceLeadId`, `clerkUserId`, `ownerIdentity`, `content`, `createdAt`, and `updatedAt`, plus Convex system fields. Creation derives ownership from the verified subject and token identifier and assigns both timestamps on the backend. Listing queries the `by_ownerIdentity_and_salesforceLeadId` index in descending order. Updates and deletes check both the issuer-scoped token identifier and Clerk subject against the stored document. Missing and other-owned records share one error. Updates change content and `updatedAt`; deletes remove the record. The backend trims and validates note text at 1–5,000 characters and checks the shape of Salesforce Lead IDs. Convex has no Salesforce existence or visibility lookup for note references.

### Next.js → Salesforce lookup → Slack

The Slack button posts only `{ leadId }` to `POST /api/slack/notify`. The server checks Clerk approval, rejects a mismatched Origin when supplied, requires JSON, and validates the ID. `getSalesforceLead` fetches that ID directly under the integration user's Salesforce permissions. A missing or invisible record returns `404`, regardless of which page originally displayed it.

`notifySlack` posts server-resolved fields as plain-text Block Kit content to a fixed, validated HTTPS `hooks.slack.com` Incoming Webhook destination. The payload includes Name, Company, Email, Status, and the Lead ID. Redirects are rejected, the request times out after 10 seconds, and success requires an HTTP success response with a trimmed `ok` body. Slack throttling maps to `429`; other delivery failures or uncertain acknowledgments typically map to `502`. A timeout can follow actual delivery. The UI guards overlapping clicks, and the server has no durable delivery log or idempotency mechanism.

## Verified file and export map

All paths below are relative to the repository root and were checked against the local checkout.

| Component or feature | Exact repository path | Responsibility | Exports | Authentication and authorization |
| --- | --- | --- | --- | --- |
| Root layout | `app/layout.tsx` | Wrap UI in Clerk and Convex providers and set metadata | default `RootLayout`, `metadata` | Providers establish access to session state |
| Clerk request proxy | `proxy.ts` | Run Clerk middleware on matched requests | default `clerkMiddleware()` result, `config` | Prepares session context for downstream checks |
| Dashboard entry | `app/page.tsx` | Redirect, show Access Denied, or render dashboard | default `Home` | Session and exact Clerk ID approval |
| Sign-in | `app/sign-in/[[...sign-in]]/page.tsx` | Render Clerk sign-in | default `SignInPage` | Clerk-managed sign-in |
| Sign-up | `app/sign-up/[[...sign-up]]/page.tsx` | Render Clerk sign-up | default `SignUpPage` | Account admission controlled by Clerk configuration |
| Next.js access helper | `src/lib/authorization.ts` | Return an access decision for the page and API handlers | `getLeadHubAccessStatus` | Clerk `auth()` and shared allowlist matching |
| Shared approval policy | `lib/approved-users.ts` | Match an ID against the current runtime's configuration | `isApprovedClerkUser` | Exact trimmed-entry match; denies absent configuration |
| Lead dashboard | `app/components/lead-dashboard.tsx` | Fetch, filter, append, and display leads | default `LeadDashboard` | Homepage and Leads API enforce access |
| Leads Route Handler | `app/api/leads/route.ts` | Parse filters and return Salesforce result pages | `GET` | Clerk session and approved ID before Salesforce calls |
| Lead contracts | `lib/leads.ts` | Define DTOs and application limits | `Lead`, `LeadsPage`, `LeadsResponse`, `LEADS_PAGE_SIZE`, `LEAD_FILTER_MAX_LENGTH` | Type and constant definitions |
| Salesforce helper | `lib/salesforce.ts` | OAuth exchange, validated REST queries, lead mapping | `getSalesforceLeads`, `getSalesforceLead`, `SalesforceError` | Server-only; Salesforce bearer token and Run As permissions |
| Convex browser provider | `app/convex-client-provider.tsx` | Connect Clerk auth to Convex client | default `ConvexClientProvider` | Passes Clerk authentication to Convex |
| Convex token trust | `convex/auth.config.ts` | Configure issuer and application ID | default auth config | Clerk issuer and `convex` application ID |
| Convex access helper | `lib/convex-authorization.ts` | Obtain verified identity and require approval | `requireApprovedClerkIdentity` | `getUserIdentity()` and Clerk subject allowlist |
| Notes UI | `app/components/lead-notes.tsx` | Subscribe, paginate, and invoke note mutations | default `LeadNotes` | UI waits for authentication; Convex functions enforce approval and ownership |
| Notes functions | `convex/leadNotes.ts` | List, create, update, and delete private notes | `list`, `create`, `update`, `remove` | Approval on every function; indexed ownership and write ownership checks |
| Notes storage | `convex/schema.ts` | Declare note fields and compound index | default schema | Function layer enforces access |
| Shared note length | `lib/note-limits.ts` | Share text limit between UI and backend | `MAX_NOTE_LENGTH` | Input limit enforced by mutations |
| Auth diagnostic UI | `app/auth-test/page.tsx` | Show connection state and compare Clerk and Convex IDs | default `AuthTestPage` | Client authentication state gates query invocation |
| Auth diagnostic query | `convex/authTest.ts` | Return verified caller subject and issuer | `viewer` | Verified and approved caller |
| Slack button | `app/components/notify-slack-button.tsx` | Request a Slack send using the selected Lead ID | default `NotifySlackButton` | Slack Route Handler enforces access |
| Slack Route Handler | `app/api/slack/notify/route.ts` | Validate request, resolve Lead, send to Slack | `POST` | Clerk session, approved ID, and Origin check when supplied |
| Slack transport | `lib/slack.ts` | Validate webhook URL and send plain-text fields | `notifySlack`, `SlackError` | Server-only webhook credential |

## Environment and deployment boundaries

| Runtime | Configuration names | Evidence and handling |
| --- | --- | --- |
| Next.js browser/build | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CONVEX_URL` | Clerk wiring and routing are documented. The Convex provider explicitly requires its public URL. Public values are browser configuration. |
| Next.js server | `CLERK_SECRET_KEY`, `AUTHORIZED_CLERK_USER_IDS`, `SALESFORCE_LOGIN_URL`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SLACK_WEBHOOK_URL` | Clerk secret, Salesforce credentials, and webhook URL belong on the server. The allowlist is server-side access policy. |
| Convex deployment | `CLERK_JWT_ISSUER_DOMAIN`, `AUTHORIZED_CLERK_USER_IDS` | Read by backend auth and approval code. Configure them in the deployment serving the frontend. The issuer must match the corresponding Clerk instance. |
| Local Convex CLI | `CONVEX_DEPLOYMENT` | Tooling target selection documented by the repository. It is separate from the browser URL. |
| Optional deployment automation | `CONVEX_DEPLOY_KEY` | Used by a separately configured Convex deployment integration. This repository's checked-in CI and npm build do not use it. |

[.gitignore](../.gitignore) ignores `.env*` and `.vercel`. [.vercelignore](../.vercelignore) excludes `.env*`, local Convex state, agent folders, dependencies, and build output from upload. The audit checked names and configuration references only. Environment files, credential values, and actual approved IDs were not inspected. Align approved IDs between Next.js and Convex for each environment.

### GitHub Actions and test coverage

- [.github/workflows/ci.yml](../.github/workflows/ci.yml) defines **CI**, triggered by pull requests targeting `main` and pushes to `main`. The single **Lint, typecheck, and test** job runs on `ubuntu-latest` with a 10-minute timeout, read-only contents permission, checkout with credential persistence disabled, and Node.js 24 with npm cache.
- [package.json](../package.json) maps lint to `eslint`, typecheck to `next typegen && tsc --noEmit`, and test to `vitest run`. The workflow runs `npm ci` followed by those three checks. The production build script runs `next build` and is a separate step outside this workflow. The workflow contains no deployment step and supplies no application credentials.
- [vitest.config.mts](../vitest.config.mts) resolves `@` to the repository root, includes `convex/**/*.test.ts` and `tests/**/*.test.ts`, defaults to Edge Runtime, and inlines `convex-test`. Both files under `tests/` select Node.
- [convex/leadNotes.test.ts](../convex/leadNotes.test.ts) uses an in-process backend and mocked identities to cover approval, revocation, diagnostic access, CRUD, issuer and owner isolation, validation, and pagination. [tests/route-authorization.test.ts](../tests/route-authorization.test.ts) stubs Clerk, Salesforce, and Slack to verify homepage and route access, early denials, origin handling, and selected-Lead lookup. [tests/salesforce-leads.test.ts](../tests/salesforce-leads.test.ts) mocks HTTP to cover lookahead, tie-breaking, escaping, cursor rejection, and safe upstream failure handling. These are source-verified test cases. Current passing status and live integrations were outside this audit.

### Vercel and Convex release model

**Repository evidence:** The checkout contains no tracked `vercel.json`, `convex.json`, or deployment workflow. [next.config.ts](../next.config.ts) configures the Next.js application build. The README describes Vercel hosting, and the guide records a historical assignment demo. Neither establishes the currently active deployment or its dashboard settings.

**Platform behavior:** With Vercel Git integration enabled and applicable auto-deploy rules, eligible pushes to non-production branches generate Preview deployments. A push or merge to Vercel's configured production branch generates a Production deployment. Preview and Production use their respective environment scopes. GitHub CI can block a merge only if the check is required by a ruleset or branch protection, and the checked-in workflow does not gate Vercel builds directly. [Vercel Git deployment documentation](https://vercel.com/docs/git) · [Vercel environment variables](https://vercel.com/docs/environment-variables)

**Convex:** The frontend connects to whichever deployment its build receives in `NEXT_PUBLIC_CONVEX_URL`. A plain Next.js build does not synchronize Convex functions. Coupled deployment is possible with a Vercel build command that invokes `convex deploy` and the corresponding deployment credentials. Convex Preview deployments, when configured, can use separate backend data and configuration. Alternatively, deploy Convex functions independently to the chosen target. [Convex Vercel integration documentation](https://docs.convex.dev/production/hosting/vercel)

| External setting or state | What remains unverified |
| --- | --- |
| Clerk dashboard | Actual Invite-only setting, invitation and account policies, dev/production instance selection, and Convex integration or JWT template |
| GitHub repository settings | Enforcement of required CI checks, current workflow results, and branch protection |
| Vercel project | Git connection, production branch and preview triggers, root/build overrides, environment scopes, deployment protection, and deployed revision |
| Convex project | Which backend each Vercel environment targets, deployed functions and revision, issuer and approval settings, preview isolation, and build integration |
| Salesforce and Slack | External Client App grant and Run As permissions, live Salesforce access, webhook status and channel membership, and successful live delivery |

## Corrections recommended for the existing documentation

| Type | Location | Finding and recommended correction |
| --- | --- | --- |
| Terminology | Guide §§2–4 and Appendix A | Make explicit that React client components and server components belong to one Next.js App Router app. Use “browser runtime” and “Next.js server runtime” for execution boundaries. |
| External setting | Guide §§7 and 13; README approval instructions | Keep Invite-only as the intended Clerk setting and label its current dashboard state unverified. A Clerk invitation and application approval are independent. |
| HTTP distinction | Guide §§4.1, 7, and 15 | Specify that the homepage renders an Access Denied screen, while the Leads and Slack APIs explicitly return HTTP `403`. Convex rejects blocked calls with function errors. |
| Missing contract detail | Guide §9 and Appendix A | Add the cursor's creation-date/ID ordering, lookahead, client deduplication, first-page status-query scope, and 120-character filter bound. Use “up to 21 queried, up to 20 returned” consistently. |
| Slack access detail | Guide §10 | Clarify that the lookup is by ID across Salesforce records visible to Run As. This extends to older pages and records outside the current dashboard filters. |
| Missing trust-boundary detail | Guide §§7–8 | Document the server allowlist and Convex allowlist as separate configurations, and distinguish Clerk subject approval from issuer-scoped note ownership. Note that the diagnostic depends on Convex approval too. |
| Historical deployment evidence | Guide §§13–15 | Label the reported demo topology and dated build successes as historical. Treat current domain routing, deployment type, build command, storage, and backend synchronization as dashboard checks. |
| CI versus CD | Guide §15; README pull request checks | State that GitHub Actions runs lint, type generation/typecheck, and mocked tests. Vercel builds separately. Mark required-check enforcement and any Convex deployment hook as unverified. |
| Missing evidence boundary | Guide §15 | Identify direct handler and in-process Convex tests as automated coverage. Keep browser authorization, live Salesforce OAuth, Slack delivery, and Preview/Production smoke checks distinct. |
| Operational wording | Guide §13 | Say that a Vercel environment change takes effect on a new deployment using that scope. Record the Convex environment separately and explain its approval setting must match the frontend environment's Clerk instance. |

## Security and operational considerations

- The app fails closed on missing approval, but each runtime reads its own list. A mismatch can allow the dashboard to load while Convex denies notes, or leave Convex access in place after a user is removed in Next.js. Document paired approval and revocation procedures.
- Approved app users share the Salesforce integration user's permissions. Keep the Run As account scoped to required records and fields. Application approval does not implement per-user Salesforce permissions.
- Slack receives Salesforce Lead information, including email and record ID. Confirm channel membership and data-handling expectations. Note text is outside the webhook payload.
- Notes are private to their Convex owner in application calls. They are not a mirror of Salesforce sharing rules and can outlive Salesforce record visibility. Document this and the absence of server-side Slack idempotency or rate limiting.
- The cursor is validated input, not an authorization token. Each page request independently checks approval and Salesforce enforces the integration user's access. Pagination does not promise a snapshot across concurrent Salesforce changes.
- If the hosted auth diagnostic is kept available, document that approved callers can see their own Clerk subject and issuer and that its browser UI lacks a feature-specific error boundary for a rejected diagnostic query.
