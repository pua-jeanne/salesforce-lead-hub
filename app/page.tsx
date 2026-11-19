import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { getLeadHubAccessStatus } from "@/src/lib/authorization";
import LeadDashboard from "./components/lead-dashboard";

export default async function Home() {
  const accessStatus = await getLeadHubAccessStatus();
  if (accessStatus === 401) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }

  if (accessStatus === 403) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-semibold">403 Access Denied</h1>
          <p className="text-sm text-slate-600">Your account is not approved for Salesforce Lead Hub. Ask your administrator for access or use the account menu to switch accounts.</p>
          <UserButton />
        </section>
      </main>
    );
  }

  return <LeadDashboard />;
}
