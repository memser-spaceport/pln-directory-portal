import { createHash } from 'crypto';
import { HIDDEN_JOB_OPENING_STATUSES } from '../job-openings/job-openings-query.service';
import { anthropicAuth } from '../shared/anthropic-auth';

export const TOP_N = 5;
export const TEAM_CONCURRENCY = 2;
export const JEV_CONCURRENCY = 10;
export const STRONG_FIT = 80;
export const GOOD_FIT = 50;
export const CLAUDE_MODEL = 'claude-opus-5-5';
export const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
export const JEV_MODEL = 'typesafe-ai/jev';
export const LOCK_MS = 5 * 60 * 1000;

const HIDDEN_STATUSES = new Set<string>(HIDDEN_JOB_OPENING_STATUSES);

export type MatchLabel = 'STRONG' | 'GOOD';

export type MatchJob = {
  uid: string;
  roleTitle: string;
  companyName: string;
  roleCategory: string | null;
  seniority: string | null;
  summary: string | null;
  descriptionHtml: string | null;
  location: string[];
  workMode: string | null;
};

export type MatchExperience = {
  title: string;
  company: string;
  current: boolean;
  description: string | null;
};

export type MatchMember = {
  uid: string;
  name: string;
  role: string | null;
  currentCompany: string | null;
  bio: string | null;
  aboutYou: string | null;
  customSkills: string[];
  city: string | null;
  country: string | null;
  skills: string[];
  experiences: MatchExperience[];
  teams: { role: string | null; team: string }[];
};

export type MarkedCriterion = { text: string; matched: boolean };

export type RankedCandidate = {
  memberUid: string;
  fit: number;
  label: MatchLabel;
  /** The member said they are interested in this role or in its team (LAB-2788). */
  interested: boolean;
};

export function utcRunDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatRunDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Absent means every team. A present list is trimmed, deduped, and must not be empty. */
export function normalizeTeamUids(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('teamUids must be an array of strings');
  }
  const teamUids = [...new Set(value.map((uid) => uid.trim()).filter(Boolean))];
  if (!teamUids.length) throw new Error('teamUids must not be empty');
  return teamUids;
}

export function lockUntil(now = Date.now()): Date {
  return new Date(now + LOCK_MS);
}

export function jobMatchBlocker(): { code: 'disabled' | 'misconfigured'; message: string } | null {
  if ((process.env.IS_JOB_MATCH_ENABLED ?? '').toLowerCase() !== 'true') {
    return { code: 'disabled', message: 'Job match is disabled' };
  }
  if (!process.env.VERCEL_AI_KEY) {
    return { code: 'misconfigured', message: 'VERCEL_AI_KEY missing' };
  }
  let mode: string;
  try {
    mode = anthropicAuth.mode;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Anthropic auth mode is invalid';
    return { code: 'misconfigured', message };
  }
  if (mode !== 'wif') {
    return {
      code: 'misconfigured',
      message: 'Job match Claude calls require ANTHROPIC_AUTH_MODE=wif (service account)',
    };
  }
  return null;
}

export function isLiveOpening(job: { status: string; publishedAt: Date | null; teamUid: string | null }): boolean {
  return Boolean(job.teamUid && job.publishedAt && !HIDDEN_STATUSES.has(job.status));
}

export function companyKey(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hasSignal(member: MatchMember): boolean {
  return Boolean(
    member.bio?.trim() ||
      member.aboutYou?.trim() ||
      member.role?.trim() ||
      member.skills.length ||
      member.customSkills.length ||
      member.experiences.length
  );
}

export function stripHtml(html: string | null | undefined): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function profileText(member: MatchMember): string {
  const skills = [...member.skills, ...member.customSkills];
  const experience = member.experiences.map((item) => {
    const current = item.current ? ' (current)' : '';
    const detail = item.description ? `: ${item.description}` : '';
    return `- ${item.title} at ${item.company}${current}${detail}`;
  });
  const teams = member.teams.slice(0, 4).map((item) => `- ${item.role || 'member'} at ${item.team}`);
  return [
    `Role: ${member.role || '—'}`,
    `Company: ${member.currentCompany || '—'}`,
    `Location: ${[member.city, member.country].filter(Boolean).join(', ') || '—'}`,
    `Skills: ${skills.join(', ') || '—'}`,
    `Bio: ${(member.bio || member.aboutYou || '').replace(/\s+/g, ' ').slice(0, 700)}`,
    'Experience:',
    ...(experience.length ? experience : ['- none']),
    ...(teams.length ? ['Teams:', ...teams] : []),
  ].join('\n');
}

export function rolePosting(job: MatchJob): string {
  return [
    `Title: ${job.roleTitle}`,
    `Company: ${job.companyName}`,
    job.roleCategory ? `Category: ${job.roleCategory}` : '',
    job.seniority ? `Seniority: ${job.seniority}` : '',
    job.location.length ? `Location: ${job.location.join(', ')}` : '',
    job.workMode ? `Work mode: ${job.workMode}` : '',
    job.summary ? `Summary: ${job.summary}` : '',
    `Description: ${stripHtml(job.descriptionHtml).slice(0, 3500)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function roleTextHash(posting: string): string {
  return createHash('sha256').update(posting).digest('hex');
}

export function profileTextHash(profile: string): string {
  return createHash('sha256').update(profile).digest('hex');
}

export type StoredScore = {
  profileHash: string;
  fits: Record<string, { fit: number; roleTextHash: string }>;
};

export function asStoredScore(value: unknown): StoredScore | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.profileHash !== 'string' ||
    !record.fits ||
    typeof record.fits !== 'object' ||
    Array.isArray(record.fits)
  ) {
    return null;
  }
  const fits: StoredScore['fits'] = {};
  for (const [roleUid, item] of Object.entries(record.fits as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const fit = (item as { fit?: unknown }).fit;
    const hash = (item as { roleTextHash?: unknown }).roleTextHash;
    if (typeof fit === 'number' && Number.isFinite(fit) && typeof hash === 'string') {
      fits[roleUid] = { fit, roleTextHash: hash };
    }
  }
  return { profileHash: record.profileHash, fits };
}

/** Fits whose profile text and role text still match. Other roles need a new Jev call. */
export function reusableFits(
  payload: unknown,
  profileHash: string,
  roleHashes: ReadonlyMap<string, string>
): Record<string, number> {
  const stored = asStoredScore(payload);
  if (!stored || stored.profileHash !== profileHash) return {};
  const fits: Record<string, number> = {};
  for (const [roleUid, hash] of roleHashes) {
    const hit = stored.fits[roleUid];
    if (hit && hit.roleTextHash === hash) fits[roleUid] = hit.fit;
  }
  return fits;
}

export function scorePayload(
  profileHash: string,
  fits: Record<string, number>,
  roleHashes: ReadonlyMap<string, string>
): StoredScore {
  const stored: StoredScore['fits'] = {};
  for (const [roleUid, fit] of Object.entries(fits)) {
    const hash = roleHashes.get(roleUid);
    if (hash) stored[roleUid] = { fit, roleTextHash: hash };
  }
  return { profileHash, fits: stored };
}

export function criteriaPrompt(posting: string): string {
  return `Extract 4 to 6 checkable criteria for matching a person's profile to this job.
Each criterion is one short line a profile can confirm or deny: a skill, seniority, or location.
Return only a JSON array of strings.\n\n${posting}`;
}

export function parseCriteria(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`criteria were not a JSON array: ${text.slice(0, 200)}`);
  const criteria = JSON.parse(match[0])
    .map((item: unknown) => String(item).trim())
    .filter(Boolean);
  if (criteria.length < 4) throw new Error(`expected at least 4 criteria, got ${criteria.length}`);
  return criteria.slice(0, 6);
}

export function jobBrief(job: MatchJob, criteria: string[]): string {
  return [
    `Title: ${job.roleTitle}`,
    `Company: ${job.companyName}`,
    job.seniority ? `Seniority: ${job.seniority}` : '',
    job.location.length ? `Location: ${job.location.join(', ')}` : '',
    job.workMode ? `Work mode: ${job.workMode}` : '',
    criteria.length ? `Criteria:\n${criteria.map((line) => `- ${line}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export type JevQuestion = {
  type: 'boolean';
  instructions: string;
  criteria: { true: string; false: string };
};

export function jevQuestions(jobs: MatchJob[], criteriaByUid: Map<string, string[]>): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const job of jobs) {
    const criteria = criteriaByUid.get(job.uid) ?? [];
    questions[job.uid] = {
      type: 'boolean',
      instructions: `This person is a credible match for the role below. Most of the criteria are supported by the profile.\n\n${jobBrief(
        job,
        criteria
      )}`,
      criteria: {
        true: 'Most of the listed criteria are supported by the profile',
        false: 'The profile does not support the listed criteria',
      },
    };
  }
  return questions;
}

export function fitsFromAnswers(
  roleUids: string[],
  answers: Record<string, { probability?: number } | undefined>
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const uid of roleUids) {
    scores[uid] = Math.round((answers[uid]?.probability ?? 0) * 100);
  }
  return scores;
}

export function labelFor(fit: number): MatchLabel | null {
  if (fit >= STRONG_FIT) return 'STRONG';
  if (fit >= GOOD_FIT) return 'GOOD';
  return null;
}

/** Highest fit first; on equal fit an interested member ranks first, then by uid. */
export function selectTop(
  memberUids: string[],
  fitsByMember: Map<string, Record<string, number>>,
  roleUid: string,
  interestedUids: ReadonlySet<string> = new Set()
): RankedCandidate[] {
  return memberUids
    .map((memberUid) => {
      const fit = fitsByMember.get(memberUid)?.[roleUid] ?? 0;
      const label = labelFor(fit);
      return label ? { memberUid, fit, label, interested: interestedUids.has(memberUid) } : null;
    })
    .filter((row): row is RankedCandidate => row !== null)
    .sort(
      (a, b) => b.fit - a.fit || Number(b.interested) - Number(a.interested) || a.memberUid.localeCompare(b.memberUid)
    )
    .slice(0, TOP_N);
}

export function scoreCoversRoles(scores: Record<string, number>, roleUids: string[]): boolean {
  return roleUids.every((uid) => Object.prototype.hasOwnProperty.call(scores, uid));
}

export function planTeamWork(args: {
  teamFinished: boolean;
  roleUids: string[];
  finishedRoleUids: string[];
  memberUids: string[];
  scoresByMember: Map<string, Record<string, number>>;
}): { skipTeam: boolean; membersToScore: string[]; rolesToFinish: string[] } {
  if (args.teamFinished) return { skipTeam: true, membersToScore: [], rolesToFinish: [] };
  const finished = new Set(args.finishedRoleUids);
  const rolesToFinish = args.roleUids.filter((uid) => !finished.has(uid));
  if (rolesToFinish.length === 0) return { skipTeam: false, membersToScore: [], rolesToFinish: [] };
  const membersToScore = args.memberUids.filter((uid) => {
    const scores = args.scoresByMember.get(uid);
    return !scores || !scoreCoversRoles(scores, args.roleUids);
  });
  return { skipTeam: false, membersToScore, rolesToFinish };
}

export function blurbPrompt(job: MatchJob, criteria: string[], ranked: { member: MatchMember; fit: number }[]): string {
  const people = ranked
    .map(
      (row, index) =>
        `${index + 1}. memberUid=${row.member.uid} ${row.member.name} — ${row.fit}%\n${profileText(row.member)}`
    )
    .join('\n\n');
  return `Explain these ranked candidates for the role.
For each person return:
- blurb: one sentence on why they fit or miss, naming the criteria that hold
- matched: one boolean per criterion, in the listed order, true only when the profile supports that criterion
Return only a JSON array of objects with memberUid, blurb, and matched.
No introduction.

${jobBrief(job, criteria)}

Criteria order:
${criteria.map((line, index) => `${index + 1}. ${line}`).join('\n')}

${people}`;
}

export function parseCandidateNotes(
  text: string,
  expected: { memberUid: string; criteriaCount: number }[]
): Map<string, { blurb: string; matched: boolean[] }> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`blurbs were not a JSON array: ${text.slice(0, 200)}`);
  const rows = JSON.parse(match[0]);
  if (!Array.isArray(rows)) throw new Error('blurbs were not a JSON array');
  const byUid = new Map<string, { blurb: string; matched: boolean[] }>();
  for (const row of rows) {
    if (!row || typeof row.memberUid !== 'string' || typeof row.blurb !== 'string' || !Array.isArray(row.matched)) {
      throw new Error('blurb row is missing memberUid, blurb, or matched');
    }
    const matched = row.matched.map((value: unknown) => {
      if (typeof value !== 'boolean') throw new Error('matched values must be booleans');
      return value;
    });
    byUid.set(row.memberUid, { blurb: row.blurb.trim(), matched });
  }
  for (const item of expected) {
    const note = byUid.get(item.memberUid);
    if (!note) throw new Error(`missing blurb for ${item.memberUid}`);
    if (note.matched.length !== item.criteriaCount) {
      throw new Error(`matched length for ${item.memberUid}`);
    }
  }
  return byUid;
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function asScoreMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const scores: Record<string, number> = {};
  for (const [key, fit] of Object.entries(value as Record<string, unknown>)) {
    if (typeof fit === 'number' && Number.isFinite(fit)) scores[key] = fit;
  }
  return scores;
}

export function asMarkedCriteria(value: unknown): MarkedCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const text = 'text' in item ? String(item.text).trim() : '';
    if (!text) return [];
    const matched = 'matched' in item && item.matched === true;
    return [{ text, matched }];
  });
}

export function labelText(label: MatchLabel): 'Strong match' | 'Good match' {
  return label === 'STRONG' ? 'Strong match' : 'Good match';
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(Math.max(limit, 0), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      const message = error instanceof Error ? error.message : String(error);
      const throttled = /429|rate_limit|high demand|at capacity|credit balance/.test(message);
      const wait = throttled ? 2000 * 2 ** attempt : 800 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}: ${message}`);
}
