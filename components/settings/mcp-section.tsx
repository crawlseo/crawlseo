"use client";

import { useId, useState } from "react";
import { Bot, Check, CheckCircle2, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import type { McpKeyView, McpStatus } from "@/lib/mcp-settings";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:bg-bg focus:outline-none aria-invalid:border-danger";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function OnOffBadge({ on }: { on: boolean }) {
  return on ? (
    <span className="mono-label inline-flex shrink-0 items-center rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] leading-4 text-success">
      On
    </span>
  ) : (
    <span className="mono-label inline-flex shrink-0 items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
      Off
    </span>
  );
}

/**
 * Settings > MCP: turn MCP on or off for the account, and create and revoke
 * the access keys that /mcp and the @crawlseo/mcp package use. A new key is
 * shown once, right after it is created.
 */
export function McpSection({ initial, endpoint }: { initial: McpStatus; endpoint: string }) {
  const id = useId();
  const [status, setStatus] = useState(initial);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string; key: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function request(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setMessage(null);
    try {
      const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMessage({ ok: false, text: typeof data.error === "string" ? data.error : "That did not work. Try again." });
        return null;
      }
      return data;
    } catch {
      setMessage({ ok: false, text: "That did not work. Try again." });
      return null;
    }
  }

  async function toggle() {
    setBusy("toggle");
    const data = await request("/api/user/mcp", { method: "PUT", body: JSON.stringify({ enabled: !status.enabled }) });
    if (data) setStatus(data as unknown as McpStatus);
    setBusy(null);
  }

  async function create(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy("create");
    setCreated(null);
    const data = await request("/api/user/mcp/keys", { method: "POST", body: JSON.stringify({ name }) });
    if (data) {
      const { key, ...view } = data as unknown as McpKeyView & { key: string };
      setStatus((s) => ({ ...s, keys: [view, ...s.keys] }));
      setCreated({ id: view.id, name: view.name, key });
      setName("");
    }
    setBusy(null);
  }

  async function revoke(key: McpKeyView) {
    setBusy(key.id);
    const data = await request(`/api/user/mcp/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
    if (data) {
      setStatus((s) => ({ ...s, keys: s.keys.filter((k) => k.id !== key.id) }));
      setMessage({ ok: true, text: `Revoked "${key.name}". It no longer works.` });
      if (created?.id === key.id) setCreated(null);
    }
    setConfirming(null);
    setBusy(null);
  }

  const command = `claude mcp add --transport http crawlseo ${endpoint} --header "Authorization: Bearer ${created?.key ?? "<key>"}"`;

  return (
    <div className="panel divide-y divide-border-soft">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-soft text-text-strong">
            <Bot className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="text-[15px] leading-5 font-medium text-text-strong">MCP access</h3>
              <OnOffBadge on={status.enabled} />
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              Lets an AI agent read your sites&apos; data with one of the keys below, at{" "}
              <code className="font-data break-all text-text">{endpoint}</code> or through the{" "}
              <code className="font-data">@crawlseo/mcp</code> package. Read-only: no tool changes anything or starts a
              crawl or sync. While MCP is off, every key is refused.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={status.enabled ? "outline" : "default"}
          className="self-start sm:self-center"
          disabled={busy !== null}
          aria-pressed={status.enabled}
          onClick={() => void toggle()}
        >
          {busy === "toggle" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status.enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>

      <div className="space-y-4 p-5">
        <form noValidate onSubmit={create} className="max-w-[560px]">
          <label htmlFor={`${id}-name`} className="mb-1 block text-xs font-medium text-muted-foreground">
            New key name
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-name`}
              name="name"
              autoComplete="off"
              maxLength={60}
              placeholder="e.g. Laptop, Claude Code"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
            <Button type="submit" size="sm" className="shrink-0 self-center" disabled={busy !== null || !name.trim()}>
              {busy === "create" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
              Create key
            </Button>
          </div>
        </form>

        {created && (
          <div role="status" className="space-y-2 rounded-lg border border-success/30 bg-success-bg p-4">
            <p className="text-[13px] leading-5 font-medium text-text-strong">
              Key &quot;{created.name}&quot; created. Copy it now: it is stored hashed and is not shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-data text-xs break-all text-text-strong">
                {created.key}
              </code>
              <CopyButton text={created.key} label="Copy the key" />
            </div>
            <p className="text-xs text-muted-foreground">Add it to Claude Code:</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-data text-xs break-all text-text">
                {command}
              </code>
              <CopyButton text={command} label="Copy the command" />
            </div>
            {!status.enabled && <p className="text-xs text-danger">MCP is off: turn it on above before you use the key.</p>}
          </div>
        )}

        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={message.ok ? "flex items-center gap-1.5 text-xs text-success" : "text-xs text-danger"}
          >
            {message.ok && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
            {message.text}
          </p>
        )}

        {status.keys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-border-soft rounded-lg border border-border" aria-label="Access keys">
            {status.keys.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-strong">{k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <code className="font-data">{k.prefix}…</code> · created {formatDay(k.createdAt, { year: true })} ·{" "}
                    {k.lastUsedAt ? `last used ${formatDay(k.lastUsedAt, { year: true, time: true })}` : "never used"}
                  </p>
                </div>
                {confirming === k.id ? (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="xs" variant="destructive" disabled={busy !== null} onClick={() => void revoke(k)}>
                      {busy === k.id && <Loader2 className="animate-spin" aria-hidden />}
                      Revoke &quot;{k.name}&quot;
                    </Button>
                    <Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="shrink-0 self-start sm:self-center"
                    disabled={busy !== null}
                    onClick={() => setConfirming(k.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
