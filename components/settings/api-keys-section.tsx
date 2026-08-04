"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Save, Trash2 } from "lucide-react";

type ApiKeyStatus = Record<string, { connected: boolean; updatedAt?: string }>;

export function ApiKeysSection({
  initialStatus,
}: {
  initialStatus: ApiKeyStatus;
}) {
  const [status, setStatus] = useState<ApiKeyStatus>(initialStatus);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pagespeedKey, setPagespeedKey] = useState("");
  const [pagespeedSaving, setPagespeedSaving] = useState(false);
  const [pagespeedDeleting, setPagespeedDeleting] = useState(false);
  const [pagespeedError, setPagespeedError] = useState<string | null>(null);

  const isConnected = status.dataforseo?.connected ?? false;
  const isPagespeedConnected = status.google_pagespeed?.connected ?? false;

  async function handleTest() {
    if (!login || !password) return;
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
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
    if (!login || !password) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "dataforseo", login, password }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          dataforseo: { connected: true, updatedAt: new Date().toISOString() },
        }));
        setLogin("");
        setPassword("");
        setTestResult(null);
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
        body: JSON.stringify({ provider: "dataforseo" }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          dataforseo: { connected: false },
        }));
      }
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handlePagespeedSave() {
    if (!pagespeedKey) return;
    setPagespeedSaving(true);
    setPagespeedError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google_pagespeed", apiKey: pagespeedKey }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          google_pagespeed: { connected: true, updatedAt: new Date().toISOString() },
        }));
        setPagespeedKey("");
      } else {
        const data = await res.json();
        setPagespeedError(data.error || "Failed to save");
      }
    } catch {
      setPagespeedError("Save failed");
    } finally {
      setPagespeedSaving(false);
    }
  }

  async function handlePagespeedDelete() {
    setPagespeedDeleting(true);
    setPagespeedError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google_pagespeed" }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          google_pagespeed: { connected: false },
        }));
      }
    } catch {
      setPagespeedError("Delete failed");
    } finally {
      setPagespeedDeleting(false);
    }
  }

  return (
    <div className="panel p-5">
      <h3 className="font-heading text-lg font-semibold text-foreground">
        External API Keys
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect third-party APIs for advanced SEO data like keyword volume,
        domain analysis, and backlinks.
      </p>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">DataForSEO</h4>
            <p className="text-xs text-muted-foreground">
              Keyword research, domain analysis, backlink data
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1.5 rounded-full bg-signal/10 px-2.5 py-1 text-xs font-medium text-signal">
                <CheckCircle2 className="size-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
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
              {status.dataforseo.updatedAt
                ? new Date(status.dataforseo.updatedAt).toLocaleDateString()
                : "—"}
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
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
                Login
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="API password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}

            {testResult === true && (
              <p className="flex items-center gap-1.5 text-xs text-signal">
                <CheckCircle2 className="size-3.5" />
                Connection successful
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={!login || !password || testing}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FlaskConical className="size-3" />
                )}
                Test Connection
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!login || !password || saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
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

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">Google PageSpeed Insights</h4>
            <p className="text-xs text-muted-foreground">
              Core Web Vitals and Lighthouse lab data for your top pages
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPagespeedConnected ? (
              <span className="flex items-center gap-1.5 rounded-full bg-signal/10 px-2.5 py-1 text-xs font-medium text-signal">
                <CheckCircle2 className="size-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <XCircle className="size-3.5" />
                Not configured
              </span>
            )}
          </div>
        </div>

        {isPagespeedConnected ? (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Last updated:{" "}
              {status.google_pagespeed.updatedAt
                ? new Date(status.google_pagespeed.updatedAt).toLocaleDateString()
                : "—"}
            </p>
            <button
              type="button"
              onClick={handlePagespeedDelete}
              disabled={pagespeedDeleting}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              {pagespeedDeleting ? (
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
                API Key
              </label>
              <input
                type="password"
                value={pagespeedKey}
                onChange={(e) => setPagespeedKey(e.target.value)}
                placeholder="AIza..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {pagespeedError && <p className="text-xs text-danger">{pagespeedError}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePagespeedSave}
                disabled={!pagespeedKey || pagespeedSaving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {pagespeedSaving ? (
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
    </div>
  );
}
