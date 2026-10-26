import type { AlertDelivery } from "@/lib/webhooks/deliver";
import { appUrl } from "@/lib/webhooks/deliver";
import type { EmailMessage } from "./send";

/*
 * The alert emails: plain text plus simple HTML. No tracking pixel, no
 * remote image, no link except to this instance (NEXTAUTH_URL).
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Subject lines stay on one line whatever a domain or message holds. */
function oneLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").trim();
}

function html(title: string, paragraphs: string[], items: string[], link: { href: string; label: string } | null): string {
  const body = [
    `<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>`,
    ...paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`),
    items.length ? `<ul style="margin:0 0 12px;padding-left:20px">${items.map((i) => `<li style="margin:0 0 6px">${escapeHtml(i)}</li>`).join("")}</ul>` : "",
    link ? `<p style="margin:0 0 12px"><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : "",
    `<p style="margin:16px 0 0;color:#666;font-size:12px">Sent by your crawlseo instance. Turn these emails off in Settings &gt; Email alerts.</p>`,
  ].join("");
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#111">${body}</body></html>`;
}

/** Every alert that fired for one site in one evaluation, in one email. */
export function alertEmail(to: string[], delivery: AlertDelivery): EmailMessage {
  const first = delivery.fires[0];
  const domain = oneLine(first?.domain ?? "your site");
  const count = delivery.fires.length;
  const subject = `[crawlseo] ${count === 1 ? "1 alert" : `${count} alerts`} on ${domain}`;
  const base = appUrl();
  const link = base && first ? { href: `${base}/sites/${encodeURIComponent(first.siteId)}/alerts`, label: "Open the alerts in crawlseo" } : null;
  const lines = delivery.fires.map((f) => oneLine(f.message));
  const intro = `${count === 1 ? "An alert" : `${count} alerts`} fired on ${domain} at ${delivery.firedAt}.`;
  const text = [
    intro,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    ...(link ? [`${link.label}: ${link.href}`, ""] : []),
    "Sent by your crawlseo instance. Turn these emails off in Settings > Email alerts.",
  ].join("\n");
  return { to, subject, text, html: html(subject.replace(/^\[crawlseo\] /, ""), [intro], lines, link) };
}

export function testEmail(to: string[]): EmailMessage {
  const subject = "[crawlseo] Test email";
  const message = "Test email from crawlseo. Your alert emails work.";
  const base = appUrl();
  const link = base ? { href: `${base}/settings#email`, label: "Email alert settings" } : null;
  const text = [message, "", ...(link ? [`${link.label}: ${link.href}`, ""] : []), "Sent by your crawlseo instance."].join("\n");
  return { to, subject, text, html: html("Test email", [message], [], link) };
}
