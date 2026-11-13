import { auth } from "@clerk/nextjs/server";
import LeadDashboard from "./components/lead-dashboard";

export default async function Home() {
  await auth.protect();
  return <LeadDashboard />;
}
