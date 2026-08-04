import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeywordResult = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  trend: number[] | null; // monthly search volume trend
};

export type DomainOverviewResult = {
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  backlinks: number;
  referringDomains: number;
};

export type BacklinksOverviewResult = {
  totalBacklinks: number;
  referringDomains: number;
  referringIps: number;
  dofollow: number;
  nofollow: number;
};

export type BacklinkItem = {
  referringDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  dofollow: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
};

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

async function getCredentials(userId: string): Promise<{ login: string; password: string } | null> {
  const apiKey = await db.apiKey.findUnique({
    where: { userId_provider: { userId, provider: "dataforseo" } },
  });
  if (!apiKey || !apiKey.encryptedLogin) return null;

  return {
    login: decrypt(apiKey.encryptedLogin),
    password: decrypt(apiKey.encryptedPassword),
  };
}

function authHeader(login: string, password: string): string {
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

async function dataforseoPost<T>(
  login: string,
  password: string,
  endpoint: string,
  body: unknown[]
): Promise<T | null> {
  const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(login, password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`DataForSEO ${endpoint} error: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json();
  if (json.status_code !== 20000) {
    console.error(`DataForSEO ${endpoint} API error:`, json.status_message);
    return null;
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testConnection(login: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      method: "GET",
      headers: { Authorization: authHeader(login, password) },
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.status_code === 20000;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Keyword Research
// ---------------------------------------------------------------------------

export async function keywordResearch(
  userId: string,
  seed: string,
  language?: string,
  location?: number
): Promise<KeywordResult[] | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/dataforseo_labs/google/related_keywords/live", [
    {
      keyword: seed,
      language_code: language || "en",
      location_code: location || 2840, // US
      limit: 50,
    },
  ]);

  if (!data?.tasks?.[0]?.result?.[0]?.items) return [];

  return data.tasks[0].result[0].items.map((item: any) => ({
    keyword: item.keyword_data?.keyword ?? item.keyword ?? seed,
    volume: item.keyword_data?.keyword_info?.search_volume ?? null,
    difficulty: item.keyword_data?.keyword_info?.keyword_difficulty ?? null,
    cpc: item.keyword_data?.keyword_info?.cpc ?? null,
    competition: item.keyword_data?.keyword_info?.competition ?? null,
    trend: item.keyword_data?.keyword_info?.monthly_searches?.map((m: any) => m.search_volume) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Domain Overview
// ---------------------------------------------------------------------------

export async function domainOverview(
  userId: string,
  domain: string
): Promise<DomainOverviewResult | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/dataforseo_labs/google/domain_rank_overview/live", [
    { target: domain, language_code: "en", location_code: 2840 },
  ]);

  const item = data?.tasks?.[0]?.result?.[0];
  if (!item) return null;

  return {
    organicKeywords: item.metrics?.organic?.count ?? 0,
    organicTraffic: item.metrics?.organic?.etv ?? 0,
    organicCost: item.metrics?.organic?.estimated_paid_traffic_cost ?? 0,
    backlinks: item.metrics?.organic?.backlinks ?? 0,
    referringDomains: item.metrics?.organic?.referring_domains ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Backlinks Overview
// ---------------------------------------------------------------------------

export async function backlinksOverview(
  userId: string,
  domain: string
): Promise<BacklinksOverviewResult | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/backlinks/summary/live", [
    { target: domain, internal_list_limit: 0, backlinks_filters: [] },
  ]);

  const item = data?.tasks?.[0]?.result?.[0];
  if (!item) return null;

  return {
    totalBacklinks: item.backlinks ?? 0,
    referringDomains: item.referring_domains ?? 0,
    referringIps: item.referring_ips ?? 0,
    dofollow: item.backlinks - (item.referring_links_nofollow ?? 0),
    nofollow: item.referring_links_nofollow ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Backlinks Profile (individual links)
// ---------------------------------------------------------------------------

export async function backlinksProfile(
  userId: string,
  domain: string,
  limit = 50,
  offset = 0
): Promise<BacklinkItem[] | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const data = await dataforseoPost<any>(creds.login, creds.password, "/backlinks/backlinks/live", [
    {
      target: domain,
      mode: "as_is",
      limit,
      offset,
      order_by: ["rank,desc"],
    },
  ]);

  if (!data?.tasks?.[0]?.result?.[0]?.items) return [];

  return data.tasks[0].result[0].items.map((item: any) => ({
    referringDomain: item.referring_main_domain ?? "",
    sourceUrl: item.url_from ?? "",
    targetUrl: item.url_to ?? "",
    anchorText: item.anchor ?? "",
    dofollow: item.dofollow ?? true,
    firstSeen: item.first_seen ?? null,
    lastSeen: item.last_seen ?? null,
  }));
}
