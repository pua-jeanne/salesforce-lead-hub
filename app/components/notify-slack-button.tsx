"use client";

import { useRef, useState } from "react";

export default function NotifySlackButton({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function send() {
    if (pending.current || status === "sent") return;
    pending.current = true;
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/slack/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "Unable to notify Slack. Please try again.";
        throw new Error(message);
      }
      setStatus("sent");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to notify Slack. Please try again.");
      setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="max-w-64">
      <button
        type="button"
        onClick={() => void send()}
        disabled={status === "sending" || status === "sent"}
        aria-label={`Notify Slack about ${leadName}`}
        className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : status === "sent" ? "Sent to Slack" : "Notify Slack"}
      </button>
      {status === "sent" && <span role="status" className="sr-only">Notification sent for {leadName}.</span>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
