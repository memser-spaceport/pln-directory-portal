export function resolveTeamPitchSupportEmail(supportEmail?: string | null): string | null {
  const trimmed = supportEmail?.trim();
  if (trimmed) {
    return trimmed;
  }

  return process.env.LABOS_SUPPORT_EMAIL?.trim() || null;
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
