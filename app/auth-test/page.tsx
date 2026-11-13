"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function VerifiedIdentity() {
  const viewer = useQuery(api.authTest.viewer);
  const { userId } = useAuth();

  if (viewer === undefined) return <p>Checking your identity with Convex…</p>;

  return (
    <div className="space-y-3">
      <p role="status">
        {viewer.subject === userId
          ? "Success: Convex verified your Clerk identity."
          : "Identity mismatch: sign out and try again."}
      </p>
      <dl className="space-y-2 break-all">
        <dt className="font-semibold">Clerk user ID verified by Convex</dt>
        <dd>{viewer.subject}</dd>
        <dt className="font-semibold">Token issuer</dt>
        <dd>{viewer.issuer}</dd>
      </dl>
    </div>
  );
}

export default function AuthTestPage() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Clerk + Convex authentication test</h1>
      <AuthLoading><p role="status">Loading authentication…</p></AuthLoading>
      <Unauthenticated>
        {isLoaded && isSignedIn ? (
          <p role="alert">Clerk is signed in, but Convex has not authenticated. Check the issuer configuration and Convex deployment.</p>
        ) : (
          <p>Sign in to verify your identity with Convex.</p>
        )}
        <div className="mt-4">
          {isSignedIn ? <UserButton /> : <SignInButton mode="redirect" forceRedirectUrl="/auth-test" />}
        </div>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
        <VerifiedIdentity />
      </Authenticated>
    </main>
  );
}
