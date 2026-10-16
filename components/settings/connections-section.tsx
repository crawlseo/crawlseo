"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Gauge,
  Loader2,
  Search,
  SearchCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DisconnectGoogleDialog } from "@/components/account/account-actions";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApiKeyProvider as KeyProvider, ApiKeyStatus } from "@/lib/api-keys";

// The key form stops at a reading width: the content area grows to 1600 px, and a key field as wide as that
// is hard to scan. Labels, fields and messages share the cap; the buttons keep their own size.
const FORM_MAX_WIDTH = "max-w-[560px]";
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:bg-bg focus:outline-none aria-invalid:border-danger";

export type GoogleConnection = {
  connected: boolean;
  /** Granted OAuth scopes, as Google returned them. */
  scopes: string[];
  /** True when the stored tokens are encrypted. */
  sealed: boolean;
};

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Sign-in",
  email: "Email address",
  profile: "Name and picture",
  "https://www.googleapis.com/auth/userinfo.email": "Email address",
  "https://www.googleapis.com/auth/userinfo.profile": "Name and picture",
  "https://www.googleapis.com/auth/webmasters.readonly": "Search Console, read-only",
};

type Field = { name: "login" | "password" | "apiKey"; label: string; type: "text" | "password" };

type KeyProviderConfig = {
  provider: KeyProvider;
  name: string;
  description: string;
  icon: LucideIcon;
  fields: Field[];
  /** Under the last field: where the key comes from. */
  help: string;
  helpLink: { href: string; label: string };
  /** POST /api/user/api-keys/test can check these credentials. */
  testable: boolean;
  /** What else goes when the key is removed, said in the confirmation. */
  disconnectNote: string;
};

const KEY_PROVIDERS: KeyProviderConfig[] = [
  {
    provider: "bing",
    name: "Bing Webmaster Tools",
    description: "Bing queries, pages, crawl and index stats. Free.",
    icon: Search,
    fields: [{ name: "apiKey", label: "API key", type: "password" }],
    help: "In Bing Webmaster Tools open Settings, API access, then Generate API key. One key covers every verified site on that account; generating a new one invalidates the old.",
    helpLink: { href: "https://www.bing.com/webmasters", label: "Open Bing Webmaster Tools" },
    testable: true,
    disconnectNote:
      "Every site loses its Bing property, and the Bing data synced for your sites is deleted.",
  },
  {
    provider: "dataforseo",
    name: "DataForSEO",
    description: "Keyword research, domain analysis and backlink data. Paid per request.",
    icon: Database,
    fields: [
      { name: "login", label: "API login", type: "text" },
      { name: "password", label: "API password", type: "password" },
    ],
    help: "Your API login and password are on the DataForSEO API access page. The API password is not your dashboard password.",
    helpLink: { href: "https://app.dataforseo.com/api-access", label: "Open DataForSEO API access" },
    testable: true,
    disconnectNote: "Keyword research, domain overview and backlinks fall back to Search Console data.",
  },
  {
    provider: "google_pagespeed",
    name: "Google PageSpeed Insights",
    description: "Core Web Vitals and Lighthouse lab data for your top pages, on your own quota.",
    icon: Gauge,
    fields: [{ name: "apiKey", label: "API key", type: "password" }],
    help: "Create an API key in the Google Cloud console and enable the PageSpeed Insights API in the same project. Without a key, vitals use the shared quota.",
    helpLink: {
      href: "https://console.cloud.google.com/apis/credentials",
      label: "Open Google Cloud credentials",
    },
    testable: false,
    disconnectNote: "Vitals checks go back to the shared quota.",
  },
];

/**
 * Every service crawlseo connects to, one row each in one list: Google (the
 * sign-in grant that reads Search Console) and the per-user API keys stored
 * through /api/user/api-keys. A key applies to every site of the user.
 */
export function ConnectionsSection({
  google,
  initialStatus,
  initialOpen = null,
}: {
  google: GoogleConnection;
  /** The body of GET /api/user/api-keys. */
  initialStatus: ApiKeyStatus;
  /** A provider whose form starts expanded, e.g. from a "Connect Bing" link. */
  initialOpen?: KeyProvider | null;
}) {
  const [status, setStatus] = useState<ApiKeyStatus>(initialStatus);
  const [open, setOpen] = useState<KeyProvider | null>(
    initialOpen && !initialStatus[initialOpen]?.connected ? initialOpen : null
  );

  function markConnected(provider: KeyProvider, connected: boolean) {
    setStatus((prev) => ({
      ...prev,
      [provider]: connected
        ? { connected: true, updatedAt: new Date().toISOString() }
        : { connected: false },
    }));
  }

  return (
    <ul className="panel divide-y divide-border-soft">
      <GoogleRow google={google} />
      {KEY_PROVIDERS.map((config) => (
        <KeyRow
          key={config.provider}
          config={config}
          status={status[config.provider]}
          expanded={open === config.provider}
          onExpand={(expanded) => setOpen(expanded ? config.provider : null)}
          onStatusChange={markConnected}
        />
      ))}
    </ul>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="mono-label inline-flex shrink-0 items-center rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] leading-4 text-success">
      Connected
    </span>
  ) : (
    <span className="mono-label inline-flex shrink-0 items-center rounded-md border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">
      Not connected
    </span>
  );
}

/** Icon, name, badge and description on the left; the actions on the right, below on a phone. */
function RowHead({
  icon: Icon,
  name,
  connected,
  description,
  actions,
  actionsRef,
}: {
  icon: LucideIcon;
  name: string;
  connected: boolean;
  description: React.ReactNode;
  actions: React.ReactNode;
  actionsRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-soft text-text-strong">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-[15px] leading-5 font-medium text-text-strong">{name}</h3>
            <StatusBadge connected={connected} />
          </div>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div ref={actionsRef} className="flex shrink-0 flex-wrap items-center gap-2 empty:hidden pl-[50px] sm:pl-0">
        {actions}
      </div>
    </div>
  );
}

function GoogleRow({ google }: { google: GoogleConnection }) {
  const [showDetails, setShowDetails] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const detailsId = useId();
  const labels = [...new Set(google.scopes.map((s) => SCOPE_LABELS[s] ?? "Other"))];
  // Rows stored before scopes were kept have none listed: those count as granted.
  const gscGranted = google.connected && (google.scopes.length === 0 || google.scopes.includes(GSC_SCOPE));
  const connect = (
    <Button
      size="sm"
      disabled={connecting}
      onClick={() => {
        setConnecting(true);
        void signIn("google", { redirectTo: "/settings" });
      }}
    >
      {connecting && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      Connect
    </Button>
  );

  return (
    <li className="px-5 py-4" data-provider="google">
      <RowHead
        icon={SearchCheck}
        name="Google Search Console"
        connected={gscGranted}
        description={
          gscGranted
            ? "Your Google sign-in reads Search Console for your sites."
            : google.connected
              ? "Search Console access was not granted at sign-in. Connect to grant it."
              : "No Google tokens are stored, so Search Console cannot sync. Connect to grant access again."
        }
        actions={
          gscGranted ? (
            <DisconnectGoogleDialog />
          ) : google.connected ? (
            <>
              {connect}
              <DisconnectGoogleDialog />
            </>
          ) : (
            connect
          )
        }
      />

      {google.connected && (
        <div className="mt-3 sm:pl-[50px]">
          {labels.length > 0 && (
            <p className="text-[13px] leading-5 text-text">
              <span className="text-muted-foreground">Access: </span>
              {labels.join(", ")}
            </p>
          )}
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {google.sealed
              ? "Tokens are stored encrypted on this server."
              : "Tokens are stored on this server and are encrypted at the next refresh."}
          </p>
          {google.scopes.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showDetails}
                aria-controls={detailsId}
                onClick={() => setShowDetails((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[13px] leading-5 text-link"
              >
                Details
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showDetails && "rotate-180")}
                  aria-hidden
                />
              </button>
              {showDetails && (
                <ul id={detailsId} className="mt-2 space-y-1.5 border-l border-border pl-3">
                  {google.scopes.map((scope) => (
                    <li key={scope} className="flex flex-col gap-0.5 text-[12px] leading-4 sm:flex-row sm:gap-3">
                      <span className="text-text-strong sm:w-44 sm:shrink-0">
                        {SCOPE_LABELS[scope] ?? "Other"}
                      </span>
                      <span className="font-data break-all text-muted-foreground">{scope}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One API key provider. DataForSEO needs a login/password pair, sent as
 * `login` + `password`; the single-key providers send their key as `apiKey`,
 * which the route stores in `encryptedPassword`.
 */
function KeyRow({
  config,
  status,
  expanded,
  onExpand,
  onStatusChange,
}: {
  config: KeyProviderConfig;
  status?: { connected: boolean; updatedAt?: string };
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  onStatusChange: (provider: KeyProvider, connected: boolean) => void;
}) {
  const router = useRouter();
  const connected = status?.connected ?? false;
  const formId = useId();
  // Cancel, Save and Disconnect each replace the focused control: focus moves to the row's new action.
  const actionsRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    actionsRef.current?.querySelector("button")?.focus();
  }, [connected, expanded]);

  return (
    <li className="px-5 py-4" data-provider={config.provider}>
      <RowHead
        actionsRef={actionsRef}
        icon={config.icon}
        name={config.name}
        connected={connected}
        description={
          connected && status?.updatedAt
            ? `${config.description} Key saved ${formatDay(status.updatedAt, { year: true })}.`
            : config.description
        }
        actions={
          connected ? (
            <DisconnectKeyDialog
              config={config}
              onDisconnected={() => {
                refocus.current = true;
                onStatusChange(config.provider, false);
                router.refresh();
              }}
            />
          ) : expanded ? null : (
            <Button size="sm" variant="outline" onClick={() => onExpand(true)}>
              Connect
            </Button>
          )
        }
      />
      {!connected && expanded && (
        <KeyForm
          id={formId}
          config={config}
          onCancel={() => {
            refocus.current = true;
            onExpand(false);
          }}
          onSaved={() => {
            refocus.current = true;
            onStatusChange(config.provider, true);
            onExpand(false);
            router.refresh();
          }}
        />
      )}
    </li>
  );
}

function KeyForm({
  id,
  config,
  onCancel,
  onSaved,
}: {
  id: string;
  config: KeyProviderConfig;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const helpId = `${id}-help`;

  /** The request body, or null after marking the empty fields. */
  function credentials(): Record<string, string> | null {
    const missing = config.fields.filter((f) => !values[f.name]?.trim());
    setInvalid(missing.map((f) => f.name));
    if (missing.length > 0) {
      setTestResult(null);
      setError(`Enter the ${missing.map((f) => f.label).join(" and ")}.`);
      return null;
    }
    return Object.fromEntries(config.fields.map((f) => [f.name, values[f.name].trim()]));
  }

  async function handleTest() {
    const body = credentials();
    if (!body) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: config.provider, ...body }),
      });
      const data = await res.json();
      setTestResult(data.success === true);
      if (!data.success) setError("The service did not accept these credentials.");
    } catch {
      setTestResult(false);
      setError("The connection test could not run. Try again.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    const body = credentials();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: config.provider, ...body }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "The key could not be saved.");
      }
    } catch {
      setError("The key could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={id} onSubmit={handleSave} noValidate className="mt-4 sm:pl-[50px]">
      <div className={cn(FORM_MAX_WIDTH, "space-y-3")}>
        {config.fields.map((field, i) => {
          const inputId = `${id}-${field.name}`;
          const last = i === config.fields.length - 1;
          return (
            <div key={field.name}>
              <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted-foreground">
                {field.label}
              </label>
              <input
                id={inputId}
                name={field.name}
                type={field.type}
                autoComplete="off"
                spellCheck={false}
                autoFocus={i === 0}
                value={values[field.name] ?? ""}
                aria-invalid={invalid.includes(field.name) || undefined}
                aria-describedby={last ? helpId : undefined}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [field.name]: e.target.value }));
                  setInvalid((list) => list.filter((n) => n !== field.name));
                  setTestResult(null);
                }}
                className={INPUT_CLASS}
              />
              {last && (
                <p id={helpId} className="mt-1.5 text-xs leading-[18px] text-muted-foreground">
                  {config.help}{" "}
                  <a
                    href={config.helpLink.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-link"
                  >
                    {config.helpLink.label}
                    <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              )}
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {testResult === true && (
          <p role="status" className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Connection works. Save the key to use it.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || testing}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Save
        </Button>
        {config.testable && (
          <Button type="button" size="sm" variant="outline" disabled={saving || testing} onClick={handleTest}>
            {testing && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Test connection
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DisconnectKeyDialog({
  config,
  onDisconnected,
}: {
  config: KeyProviderConfig;
  onDisconnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: config.provider }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      onDisconnected();
    } catch {
      setError("The key could not be removed. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Disconnect</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect {config.name}?</DialogTitle>
          <DialogDescription>
            The stored key is deleted for all your sites. {config.disconnectNote}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <DialogClose render={<Button type="button" variant="outline" disabled={deleting} />}>
            Cancel
          </DialogClose>
          <Button type="button" variant="destructive" disabled={deleting} onClick={handleDisconnect}>
            {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
