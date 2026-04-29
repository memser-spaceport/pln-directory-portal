import { createHash } from 'crypto';
import type { JobAlertFilterState } from 'libs/contracts/src/schema/job-alert';

const trimAndDedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b));
};

export const canonicalizeFilterState = (input: JobAlertFilterState): JobAlertFilterState => {
  return {
    q: input.q?.trim() || undefined,
    roleCategory: trimAndDedupe(input.roleCategory ?? []),
    seniority: trimAndDedupe(input.seniority ?? []),
    focus: trimAndDedupe(input.focus ?? []),
    location: trimAndDedupe(input.location ?? []),
    workMode: trimAndDedupe(input.workMode ?? []),
  };
};

export const hashFilterState = (canonical: JobAlertFilterState): string => {
  const stable = JSON.stringify(
    {
      q: canonical.q?.toLowerCase() ?? '',
      roleCategory: canonical.roleCategory.map((v) => v.toLowerCase()),
      seniority: canonical.seniority.map((v) => v.toLowerCase()),
      focus: canonical.focus.map((v) => v.toLowerCase()),
      location: canonical.location.map((v) => v.toLowerCase()),
      workMode: canonical.workMode.map((v) => v.toLowerCase()),
    },
    Object.keys({ q: 0, roleCategory: 0, seniority: 0, focus: 0, location: 0, workMode: 0 }).sort(),
  );
  return createHash('sha256').update(stable).digest('hex');
};

const SENIORITY_DISPLAY: Record<string, string> = {
  'Junior (L1-L2)': 'Junior',
  'Mid (L3)': 'Mid',
  'Senior (L4)': 'Senior',
  'Lead (L5)': 'Lead',
  'Principal+ (L6-L7)': 'Principal+',
};

export const seniorityLabel = (raw: string): string => SENIORITY_DISPLAY[raw] ?? raw;

export const generateAutoName = (canonical: JobAlertFilterState, maxLen = 60): string => {
  const parts: string[] = [];
  if (canonical.roleCategory[0]) parts.push(canonical.roleCategory[0]);
  if (canonical.seniority[0]) parts.push(seniorityLabel(canonical.seniority[0]));
  if (canonical.focus[0]) parts.push(canonical.focus[0]);
  if (canonical.workMode[0]) parts.push(canonical.workMode[0]);
  if (canonical.q) parts.push(`"${canonical.q}"`);
  const joined = parts.join(' · ') || 'Job alert';
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1).trimEnd()}…`;
};
