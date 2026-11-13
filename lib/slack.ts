import "server-only";

import type { Lead } from "./leads";

export class SlackError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "SlackError";
  }
}

export async function notifySlack(lead: Lead): Promise<void> {
  const value = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!value) throw new SlackError("Slack is not configured. Set SLACK_WEBHOOK_URL on the server.", 503);

  let webhook: URL;
  try {
    webhook = new URL(value);
    if (
      webhook.protocol !== "https:" || webhook.hostname !== "hooks.slack.com" ||
      webhook.username || webhook.password || webhook.port || webhook.search || webhook.hash ||
      !/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(webhook.pathname)
    ) throw new Error("Invalid webhook");
  } catch {
    throw new SlackError("SLACK_WEBHOOK_URL must be a valid Slack Incoming Webhook URL.", 503);
  }

  let response: Response;
  try {
    response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        text: "Salesforce Lead notification",
        blocks: [
          { type: "header", text: { type: "plain_text", text: "Salesforce Lead notification" } },
          {
            type: "section",
            fields: [
              ["Name", lead.name], ["Company", lead.company], ["Email", lead.email || "Not provided"],
              ["Status", lead.status], ["Salesforce Lead ID", lead.id],
            ].map(([label, content]) => ({ type: "plain_text", text: `${label}\n${content}`.slice(0, 2000), emoji: false })),
          },
        ],
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
  } catch {
    throw new SlackError("Slack delivery could not be confirmed. Check the channel before trying again to avoid a duplicate.");
  }

  if (response.status === 429) {
    throw new SlackError("Slack is receiving messages too quickly. Wait a moment before trying again.", 429);
  }
  if (!response.ok) {
    throw new SlackError("Slack rejected the notification. Check the webhook, channel, and workspace permissions.");
  }
  let result: string;
  try {
    result = await response.text();
  } catch {
    throw new SlackError("Slack delivery could not be confirmed. Check the channel before trying again.");
  }
  if (result.trim() !== "ok") {
    throw new SlackError("Slack returned an unexpected response. Check the channel before trying again.");
  }
}
