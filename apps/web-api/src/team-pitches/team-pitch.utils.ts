export const DEFAULT_TEAM_PITCH_SUPPORT_EMAIL = 'pldemoday@protocol.ai';

export function resolveTeamPitchSupportEmail(supportEmail?: string | null): string {
  const trimmed = supportEmail?.trim();
  if (trimmed) {
    return trimmed;
  }

  return (
    process.env.LABOS_SUPPORT_EMAIL?.trim() || process.env.DEMO_DAY_EMAIL?.trim() || DEFAULT_TEAM_PITCH_SUPPORT_EMAIL
  );
}

/** From-address for invite/follow-up emails. Falls back to DEMO_DAY_EMAIL (current default). */
export function resolveTeamPitchSenderEmail(senderEmail?: string | null): string {
  const trimmed = senderEmail?.trim();
  if (trimmed) {
    return trimmed;
  }

  return (
    process.env.DEMO_DAY_EMAIL?.trim() || process.env.LABOS_SUPPORT_EMAIL?.trim() || DEFAULT_TEAM_PITCH_SUPPORT_EMAIL
  );
}

/** Optional trimmed string; blank becomes null. Undefined stays undefined (for partial updates). */
export function normalizeOptionalTrimmed(value?: string | null): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** RFC 5322 From header; includes display name when set (e.g. "Remi Antczak" <remi@plnetwork.io>). */
export function formatTeamPitchFromHeader(senderEmail: string, displayName?: string | null): string {
  const email = senderEmail.trim();
  const name = displayName?.trim();
  if (!name) {
    return email;
  }
  return `"${name.replace(/"/g, '')}" <${email}>`;
}

export function toKebabSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function defaultAccessForParticipantType(
  type: 'FOUNDER' | 'INVESTOR' | 'SUPPORT'
): 'VIEW' | 'VIEW_ADMIN' | 'EDIT' {
  return type === 'FOUNDER' ? 'EDIT' : 'VIEW';
}

export function resolveTeamPitchClosedAt(pitch: {
  status: string;
  closedAt: Date | null;
  updatedAt: Date;
}): string | null {
  if (pitch.status !== 'CLOSED') {
    return null;
  }

  return (pitch.closedAt ?? pitch.updatedAt).toISOString();
}

export function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}
