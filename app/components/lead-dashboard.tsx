"use client";

import { UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lead, LeadsResponse } from "@/lib/leads";
import LeadNotes from "./lead-notes";
import NotifySlackButton from "./notify-slack-button";

const statusStyles: Record<string, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-200",
  Working: "bg-amber-50 text-amber-800 ring-amber-200",
  Qualified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Unqualified: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function LeadDashboard() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLeads() {
      try {
        const response = await fetch("/api/leads", { cache: "no-store", signal: controller.signal });
        const data: LeadsResponse = await response.json();
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Unable to load Salesforce Leads.");
        }
        if (!controller.signal.aborted) setLeads(data.leads);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : "Unable to load Salesforce Leads. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadLeads();
    return () => controller.abort();
  }, [attempt]);

  const leadStatuses = [...new Set(leads.map((lead) => lead.status))].sort();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const query = search.trim().toLowerCase();
  const visibleLeads = leads.filter((lead) =>
    (status === "All statuses" || lead.status === status) &&
    [lead.name, lead.company, lead.email].some((value) => (value ?? "").toLowerCase().includes(query)),
  );
  const stats = [
    { label: "Loaded leads", value: leads.length, detail: "Latest 20 leads at most", color: "bg-indigo-500" },
    ...leadStatuses.slice(0, 3).map((value) => ({
      label: value,
      value: leads.filter((lead) => lead.status === value).length,
      detail: "Within loaded leads",
      color: "bg-blue-500",
    })),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Salesforce Lead Hub home" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-sm">L</span>
            <span className="text-base font-semibold tracking-tight sm:text-lg">Salesforce <span className="text-slate-500">Lead Hub</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 sm:inline-flex">Salesforce Leads</span>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-7xl space-y-8 px-5 py-8 sm:px-8 sm:py-12">
        <section aria-labelledby="dashboard-heading" className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase">Your workspace</p>
            <h1 id="dashboard-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">A clearer view of your leads.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">Keep your pipeline in focus, one conversation at a time.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <span aria-hidden="true" className="size-2 rounded-full bg-amber-400" /> {loading ? "Loading Salesforce…" : error ? "Salesforce unavailable" : "Salesforce"}
          </span>
        </section>

        <section aria-label="Pipeline overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-500">{stat.label}</h2>
                <span aria-hidden="true" className={`size-2 rounded-full ${stat.color}`} />
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{loading || error ? "—" : stat.value}</p>
              <p className="mt-2 text-xs text-slate-500">{stat.detail}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="leads-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-5 border-b border-slate-200 p-5 sm:p-6 lg:flex-row lg:items-center">
            <div>
              <h2 id="leads-heading" className="text-lg font-semibold">Latest leads <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{leads.length}</span></h2>
              <p className="mt-1 text-sm text-slate-500">The 20 most recently created leads visible to the integration user.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div>
                <label htmlFor="lead-search" className="sr-only">Search by name, company, or email</label>
                <input id="lead-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search leads…" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-60" />
              </div>
              <div>
                <label htmlFor="lead-status" className="sr-only">Filter by status</label>
                <select id="lead-status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                  <option>All statuses</option>
                  {leadStatuses.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </div>
          {loading && <p role="status" className="px-6 py-8 text-sm text-slate-600">Loading Salesforce Leads…</p>}
          {error && (
            <div role="alert" className="space-y-3 border-b border-red-100 bg-red-50 px-6 py-5 text-sm text-red-800">
              <p>{error}</p>
              <button type="button" onClick={() => {
                setError(null);
                setLoading(true);
                setAttempt((value) => value + 1);
              }} className="rounded-lg border border-red-200 px-3 py-2 font-medium focus-visible:outline-2">Retry</button>
            </div>
          )}
          <div
            role="region"
            aria-label="Salesforce Leads table, scroll horizontally to see all columns"
            tabIndex={0}
            className="leads-table-scroll w-full max-w-full overflow-x-scroll overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
          >
            <table className="w-full min-w-[1100px] text-left text-sm">
              <caption className="sr-only">Salesforce leads with notes and Slack notification actions.</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>{["Name", "Company", "Email", "Status", "Actions"].map((heading) => <th key={heading} scope="col" className="px-6 py-4 font-medium">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleLeads.map((lead) => (
                  <tr key={lead.id} className="transition-colors hover:bg-slate-50/80">
                    <th scope="row" className="whitespace-nowrap px-6 py-5 font-medium">
                      <span className="flex items-center gap-3"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">{lead.name.split(" ").map((part) => part[0]).join("")}</span>{lead.name}</span>
                    </th>
                    <td className="whitespace-nowrap px-6 py-5 text-slate-600">{lead.company}</td>
                    <td className="px-6 py-5 text-slate-500">{lead.email || "—"}</td>
                    <td className="px-6 py-5"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[lead.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{lead.status}</span></td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedLead(lead)}
                          aria-label={`View/Add Notes for ${lead.name}`}
                          className="whitespace-nowrap rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
                        >
                          View/Add Notes
                        </button>
                        <NotifySlackButton leadId={lead.id} leadName={lead.name} />
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !error && visibleLeads.length === 0 && <tr><td colSpan={5} className="px-6 py-16 text-center"><p className="font-medium">No leads found</p><p className="mt-2 text-slate-500">{leads.length === 0 ? "Salesforce returned no visible Leads." : "Try another name, company, or status."}</p><button type="button" onClick={() => { setSearch(""); setStatus("All statuses"); }} className="mt-4 rounded-lg px-3 py-2 font-medium text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600">Clear filters</button></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-4 text-xs text-slate-500">
            <p role="status">{loading ? "Loading leads…" : error ? "Leads unavailable" : `Showing ${visibleLeads.length} of ${leads.length} loaded leads`}</p>
            <p>Salesforce · Read-only</p>
          </div>
        </section>

        <footer className="pb-4 text-xs text-slate-500">Salesforce Lead Hub · A little clarity for every opportunity.</footer>
      </main>
      {selectedLead && <LeadNotes key={selectedLead.id} lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </div>
  );
}
