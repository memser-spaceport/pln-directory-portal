export function toKebabSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function defaultAccessForParticipantType(type: 'FOUNDER' | 'INVESTOR' | 'SUPPORT'): 'VIEW' | 'EDIT' {
  return type === 'FOUNDER' ? 'EDIT' : 'VIEW';
}
