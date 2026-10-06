"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Save, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/format";

type ApiKeyStatus = Record<string, { connected: boolean; updatedAt?: string }>;

export function ApiKeysSection({
  initialStatus,
}: {
  initialStatus: ApiKeyStatus;
}) {
  const [status, setStatus] = useState<ApiKeyStatus>(initialStatus);

  function markConnected(provider: string, connected: boolean) {
    setStatus((prev) => ({
      ...prev,
      [provider]: connected
        ? { connected: true, updatedAt: new Date().toISOString() }
        : { connected: false },
    }));
  }

  return (
    <div id="api-keys" className="panel scroll-mt-6 p-5">
      <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
        External API keys
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect third-party APIs for advanced SEO data like keyword volume,
        domain analysis, and backlinks.
      </p>

      <div className="mt-5 space-y-3">
        <ProviderCard
          provider="dataforseo"
          name="DataForSEO"
          description="Keyword research, domain analysis, backlink data"
          loginLabel="Login"
          loginPlaceholder="your@email.com"
          passwordLabel="Password"
          passwordPlaceholder="API password"
          testable
          status={status.dataforseo}
          onStatusChange={markConnected}
        />

        <ProviderCard
          provider="google_pagespeed"
          name="Google PageSpeed Insights"
          description="Core Web Vitals and Lighthouse lab data for your top pages"
          loginLabel="API key"
          loginPlaceholder="AIza..."
          status={status.google_pagespeed}
          onStatusChange={markConnected}
        />

        <ProviderCard
          provider="bing"
          name="Bing Webmaster Tools"
          description="Bing queries, pages, crawl and index stats (free)"
          loginLabel="API key"
          loginPlaceholder="Settings → API Access → Generate API Key"
          testable
          status={status.bing}
          onStatusChange={markConnected}
        />
      </div>
    </div>
  );
}

/**
 * One credential card. DataForSEO needs a login/password pair, sent as
 * `login` + `password`; the single-key providers omit the password field and
 * send their key as `apiKey`, which the route stores in `encryptedPassword`.
 * `testable` shows the Test Connection button for providers that have a
 * connection test.
 */
function ProviderCard({
  provider,
  name,
  description,
  loginLabel,
  loginPlaceholder,
  passwordLabel,
  passwordPlaceholder,
  testable = false,
  status,
  onStatusChange,
}: {
  provider: string;
  name: string;
  description: string;
  loginLabel: string;
  loginPlaceholder: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  testable?: boolean;
  status?: { connected: boolean; updatedAt?: string };
  onStatusChange: (provider: string, connected: boolean) => void;
}) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsPassword = passwordLabel !== undefined;
  const isConnected = status?.connected ?? false;
  const complete = login.length > 0 && (!needsPassword || password.length > 0);
  const credentials = needsPassword ? { login, password } : { apiKey: login };

  async function handleTest() {
    if (!complete) return;
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...credentials }),
      });
      const data = await res.json();
      setTestResult(data.success === true);
      if (!data.success) setError("Invalid credentials");
    } catch {
      setTestResult(false);
      setError("Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!complete) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...credentials }),
      });

      if (res.ok) {
        onStatusChange(provider, true);
        setLogin("");
        setPassword("");
        setTestResult(null);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      if (res.ok) {
        onStatusChange(provider, false);
        router.refresh();
      }
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-text-strong">{name}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1.5 mono-label rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] text-success">
              <CheckCircle2 className="size-3.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 mono-label rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              <XCircle className="size-3.5" />
              Not configured
            </span>
          )}
        </div>
      </div>

      {isConnected ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Last updated:{" "}
            {status?.updatedAt
              ? formatDay(status.updatedAt, { year: true })
              : "n/a"}
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-bg disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {loginLabel}
            </label>
            <input
              type={needsPassword ? "text" : "password"}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={loginPlaceholder}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:bg-bg focus:outline-none"
            />
          </div>

          {needsPassword && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {passwordLabel}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordPlaceholder}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:bg-bg focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          {testResult === true && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3.5" />
              Connection successful
            </p>
          )}

          <div className="flex items-center gap-2">
            {testable && (
              <button
                type="button"
                onClick={handleTest}
                disabled={!complete || testing}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-strong transition hover:bg-muted disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FlaskConical className="size-3" />
                )}
                Test connection
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!complete || saving}
              className={buttonVariants({ size: "sm" })}
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              Save Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
