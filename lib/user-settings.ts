import type { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/encryption";
import { DAY, isServerless, scheduleConfig } from "@/lib/jobs/config";
import type { ScheduleServerInfo, ScheduleSettings } from "@/lib/schedule-settings";

/*
 * What a user sets in Settings > Schedule and Settings > Alert webhook, one
 * UserSettings row per user. The webhook URL and secret are stored encrypted
 * like API keys.
 */

type Db = Pick<PrismaClient, "userSettings">;

/** What the server allows: its default intervals in days (0: off on this server) and whether it is serverless. */
export function scheduleServerInfo(): ScheduleServerInfo {
  const config = scheduleConfig();
  return {
    schedulerEnabled: config.enabled,
    crawlDefaultDays: Math.round(config.crawlMs / DAY),
    vitalsDefaultDays: Math.round(config.vitalsMs / DAY),
    serverless: isServerless(),
  };
}

export async function getScheduleSettings(db: Db, userId: string): Promise<ScheduleSettings> {
  const row = await db.userSettings.findUnique({
    where: { userId },
    select: { crawlScheduleDays: true, vitalsScheduleDays: true },
  });
  return { crawlDays: row?.crawlScheduleDays ?? null, vitalsDays: row?.vitalsScheduleDays ?? null };
}

export async function saveScheduleSettings(db: Db, userId: string, settings: ScheduleSettings): Promise<void> {
  const data = { crawlScheduleDays: settings.crawlDays, vitalsScheduleDays: settings.vitalsDays };
  await db.userSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export type StoredWebhook = { url: string; secret: string };

/**
 * The user's webhook, decrypted, or null when none is set. A value that no
 * longer decrypts (NEXTAUTH_SECRET changed) counts as none, as with API keys.
 */
export async function getWebhook(db: Db, userId: string): Promise<StoredWebhook | null> {
  const row = await db.userSettings.findUnique({
    where: { userId },
    select: { webhookUrl: true, webhookSecret: true },
  });
  if (!row?.webhookUrl || !row.webhookSecret) return null;
  try {
    return { url: decrypt(row.webhookUrl), secret: decrypt(row.webhookSecret) };
  } catch {
    return null;
  }
}

export async function saveWebhook(db: Db, userId: string, webhook: StoredWebhook): Promise<void> {
  const data = { webhookUrl: encrypt(webhook.url), webhookSecret: encrypt(webhook.secret) };
  await db.userSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function removeWebhook(db: Db, userId: string): Promise<void> {
  await db.userSettings.updateMany({ where: { userId }, data: { webhookUrl: null, webhookSecret: null } });
}
