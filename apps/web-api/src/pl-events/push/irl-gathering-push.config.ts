export type IrlGatheringPushConfig = {
  enabled: boolean;
  minTotalEvents: number;
  minQualifiedEvents: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  minAttendeesPerEvent: number;
  cron: string;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(raw).toLowerCase());
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : defaultValue;
}

function envString(name: string, defaultValue: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return String(raw);
}

/**
 * IRL Gathering push notification configuration.
 *
 * Category is PushNotificationCategory.IRL_GATHERING.
 * Specific rule is determined by PushNotification.metadata.kind: 'UPCOMING' | 'REMINDER'.
 */
export function getIrlGatheringPushConfig(): IrlGatheringPushConfig {
  return {
    enabled: envBool('IRL_GATHERING_PUSH_ENABLED', true),
    cron: envString('IRL_GATHERING_PUSH_CRON', '0 9 * * *'),
    minTotalEvents: envInt('IRL_GATHERING_PUSH_MIN_TOTAL_EVENTS', 5),
    minQualifiedEvents: envInt('IRL_GATHERING_PUSH_MIN_QUALIFIED_EVENTS', 2),
    upcomingWindowDays: envInt('IRL_GATHERING_PUSH_UPCOMING_WINDOW_DAYS', 45),
    reminderDaysBefore: envInt('IRL_GATHERING_PUSH_REMINDER_DAYS_BEFORE', 7),
    minAttendeesPerEvent: envInt('IRL_GATHERING_PUSH_MIN_ATTENDEES_PER_EVENT', 5),
  };
}
