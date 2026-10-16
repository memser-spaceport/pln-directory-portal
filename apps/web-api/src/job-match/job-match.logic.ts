import { createHash } from 'crypto';
import {
  MATCH_CRITERION_GROUPS,
  MATCH_CRITERION_LABEL_MAX_LENGTH,
  type MatchCriterionGroup,
} from 'libs/contracts/src/schema/job-match';
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

/**
 * One extracted criterion (LAB-2854). `statement` is the full sentence and the criterion's identity: overrides,
 * the score hash, the Jev question, the blurb prompt and each suggestion's `{ text, matched }` all use it.
 * `label` (at most 40 characters) and `group` are display only and absent on criteria not labelled yet.
 */
export type MatchCriterionItem = { statement: string; label?: string; group?: MatchCriterionGroup };

/** A criterion's `label` and `group` as response keys: present only when known, never `null`. */
export type CriterionMeta = { label?: string; group?: MatchCriterionGroup };

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

export type JobMatchBlockerOptions = { ignoreEnabledFlag?: boolean };

export function jobMatchBlocker({ ignoreEnabledFlag = false }: JobMatchBlockerOptions = {}): {
  code: 'disabled' | 'misconfigured';
  message: string;
} | null {
  if (!ignoreEnabledFlag && (process.env.IS_JOB_MATCH_ENABLED ?? '').toLowerCase() !== 'true') {
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

/**
 * The JobOpening fields a posting is built from. The service reads a role with this select and the runner's
 * raw job query lists the same columns; both hash through `currentRoleTextHash`, so they cannot disagree on
 * which posting a criteria row or an override belongs to (LAB-2846).
 */
export const MATCH_JOB_SELECT = {
  uid: true,
  roleTitle: true,
  companyName: true,
  roleCategory: true,
  seniority: true,
  summary: true,
  descriptionHtml: true,
  location: true,
  workMode: true,
} as const;

/** The hash of a role's current posting: the key of its CRITERIA row and of its criteria override. */
export function currentRoleTextHash(job: MatchJob): string {
  return roleTextHash(rolePosting(job));
}

/** The criteria the run scores against: all of them minus the disabled ones, or all when none would remain. */
export function enabledCriteria(all: string[], disabled: readonly string[]): string[] {
  const off = new Set(disabled);
  const enabled = all.filter((text) => !off.has(text));
  return enabled.length ? enabled : all;
}

/**
 * The per-role hash stored with fits. A role with nothing disabled and no lead prompt keeps its posting hash, so
 * cached fits stay valid; a role with disabled criteria gets a hash of the posting and its enabled list, so fits
 * scored with a different set are not reused. A lead prompt (LAB-2853) is hashed in too, in a separate shape so
 * the hashes of prompt-less overrides stay what they were before prompts existed (no re-score at deploy).
 */
export function scoreHash(
  postingHash: string,
  enabled: readonly string[],
  all: readonly string[],
  prompt: string | null = null
): string {
  const allEnabled = enabled.length === all.length && enabled.every((text, index) => text === all[index]);
  if (!prompt) {
    if (allEnabled) return postingHash;
    return createHash('sha256')
      .update(`${postingHash}\n${enabled.join('\n')}`)
      .digest('hex');
  }
  return createHash('sha256')
    .update(JSON.stringify({ posting: postingHash, enabled, prompt }))
    .digest('hex');
}

/**
 * The lead's free-text prompt (LAB-2853) as one line of a model prompt: whitespace collapsed to single spaces and
 * the text JSON-quoted, so it reads as the lead's words rather than as more of our instructions. Empty when there
 * is no prompt.
 */
export function leadPromptLine(prompt: string | null | undefined): string {
  const text = (prompt ?? '').replace(/\s+/g, ' ').trim();
  return text ? `The hiring lead adds: ${JSON.stringify(text)}` : '';
}

/** Every criterion of the posting in extraction order, flagged off when its statement is in `disabled`. */
export function flaggedCriteria(
  all: readonly MatchCriterionItem[],
  disabled: readonly string[]
): ({ text: string; enabled: boolean } & CriterionMeta)[] {
  const off = new Set(disabled);
  return all.map((item) => ({ text: item.statement, enabled: !off.has(item.statement), ...criterionMeta(item) }));
}

/** `label` and `group` of a criterion, each key only when it is known. */
export function criterionMeta(item: { label?: string; group?: MatchCriterionGroup } | undefined): CriterionMeta {
  const meta: CriterionMeta = {};
  if (item?.label) meta.label = item.label;
  if (item?.group) meta.group = item.group;
  return meta;
}

/**
 * Each suggestion's stored `{ text, matched }` with the label and group of the role's current criterion of the same
 * statement (LAB-2854). A criterion that is no longer current, or has no label yet, keeps just text and matched.
 */
export function withCriterionMeta(
  marked: readonly MarkedCriterion[],
  current: readonly MatchCriterionItem[]
): (MarkedCriterion & CriterionMeta)[] {
  const byStatement = new Map(current.map((item) => [item.statement, item]));
  return marked.map((item) => ({ ...item, ...criterionMeta(byStatement.get(item.text)) }));
}

/** The statements of a criteria list, in order: what every hash, prompt and override compares. */
export function criterionStatements(items: readonly MatchCriterionItem[]): string[] {
  return items.map((item) => item.statement);
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

const GROUP_LIST = MATCH_CRITERION_GROUPS.join(', ');

export function criteriaPrompt(posting: string): string {
  return `Extract 4 to 6 checkable criteria for matching a person's profile to this job.
Each criterion is one a profile can confirm or deny: a skill, experience, seniority, or location.
For each criterion return:
- statement: one short line stating the criterion
- label: a short name for it, at most ${MATCH_CRITERION_LABEL_MAX_LENGTH} characters (for example "Rust in production")
- group: one of ${GROUP_LIST}
Return only a JSON array of objects with statement, label, and group.\n\n${posting}`;
}

/** `group` as one of the known groups, matched case-insensitively; anything else is `Other`. */
export function normalizeCriterionGroup(value: unknown): MatchCriterionGroup {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return MATCH_CRITERION_GROUPS.find((group) => group.toLowerCase() === text) ?? 'Other';
}

/** A label with whitespace collapsed, cut to 40 characters with an ellipsis; `undefined` when empty. */
export function normalizeCriterionLabel(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) return undefined;
  if (text.length <= MATCH_CRITERION_LABEL_MAX_LENGTH) return text;
  return `${text.slice(0, MATCH_CRITERION_LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}

function jsonArray(text: string, what: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`${what} were not a JSON array: ${text.slice(0, 200)}`);
  const rows = JSON.parse(match[0]);
  if (!Array.isArray(rows)) throw new Error(`${what} were not a JSON array`);
  return rows;
}

/**
 * The extraction answer as 4 to 6 structured criteria (LAB-2854). Statements are trimmed; empty and repeated
 * statements are dropped; an unknown or missing group becomes `Other`; a label is trimmed and cut to 40
 * characters, and left out when empty. A bare string item is accepted as a statement in `Other` with no label.
 */
export function parseCriteria(text: string): MatchCriterionItem[] {
  const seen = new Set<string>();
  const criteria = jsonArray(text, 'criteria').flatMap((item): MatchCriterionItem[] => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const statement = (record ? String(record.statement ?? '') : String(item ?? '')).trim();
    if (!statement || seen.has(statement)) return [];
    seen.add(statement);
    const label = normalizeCriterionLabel(record?.label);
    return [{ statement, ...(label ? { label } : {}), group: normalizeCriterionGroup(record?.group) }];
  });
  if (criteria.length < 4) throw new Error(`expected at least 4 criteria, got ${criteria.length}`);
  return criteria.slice(0, 6);
}

/**
 * A stored CRITERIA payload in either shape (LAB-2854): a legacy `string[]` of statements, or
 * `{ statement, label, group }[]`. Statements are trimmed and empty ones dropped, as before; a label is kept
 * only when it is a non-empty string of at most 40 characters and a group only when it is a known one.
 * Not deduplicated, so a legacy list keeps exactly the statements (and score hash) it had.
 */
export function asCriteria(payload: unknown): MatchCriterionItem[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): MatchCriterionItem[] => {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const statement = typeof record.statement === 'string' ? record.statement.trim() : '';
      if (!statement) return [];
      const label =
        typeof record.label === 'string' && record.label.trim().length <= MATCH_CRITERION_LABEL_MAX_LENGTH
          ? record.label.trim()
          : '';
      const group = MATCH_CRITERION_GROUPS.find((known) => known === record.group);
      return [{ statement, ...(label ? { label } : {}), ...(group ? { group } : {}) }];
    }
    const statement = String(item).trim();
    return statement ? [{ statement }] : [];
  });
}

/** A CRITERIA payload written before LAB-2854: any bare string item means it has no labels or groups. */
export function isLegacyCriteriaPayload(payload: unknown): boolean {
  return Array.isArray(payload) && payload.some((item) => typeof item === 'string');
}

/** The one call that labels a legacy criteria list (LAB-2854); the statements must come back unchanged. */
export function criteriaLabelPrompt(roleTitle: string, statements: readonly string[]): string {
  return `These are the matching criteria of the job "${roleTitle}".
Give each criterion a short label and a group. Do not reword, merge, split, add or drop criteria.
For each criterion return:
- statement: the criterion exactly as written below, character for character
- label: a short name for it, at most ${MATCH_CRITERION_LABEL_MAX_LENGTH} characters
- group: one of ${GROUP_LIST}
Return only a JSON array of objects with statement, label, and group, in the listed order.

${statements.map((line) => JSON.stringify(line)).join('\n')}`;
}

/**
 * The labelling answer applied to the existing statements (LAB-2854), or `null` when it cannot be trusted: not a
 * JSON array, or its statements are not exactly the given ones (same count, each one character for character).
 * The caller then keeps the statements unlabelled. Labels and groups are normalised as at extraction.
 */
export function parseCriteriaLabels(text: string, statements: readonly string[]): MatchCriterionItem[] | null {
  let rows: unknown[];
  try {
    rows = jsonArray(text, 'criteria labels');
  } catch {
    return null;
  }
  if (rows.length !== statements.length) return null;
  const byStatement = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null;
    const record = row as Record<string, unknown>;
    if (typeof record.statement !== 'string' || byStatement.has(record.statement)) return null;
    byStatement.set(record.statement, record);
  }
  if (!statements.every((statement) => byStatement.has(statement))) return null;
  return statements.map((statement) => {
    const record = byStatement.get(statement);
    const label = normalizeCriterionLabel(record?.label);
    return { statement, ...(label ? { label } : {}), group: normalizeCriterionGroup(record?.group) };
  });
}

export function jobBrief(job: MatchJob, criteria: string[], leadPrompt: string | null = null): string {
  return [
    `Title: ${job.roleTitle}`,
    `Company: ${job.companyName}`,
    job.seniority ? `Seniority: ${job.seniority}` : '',
    job.location.length ? `Location: ${job.location.join(', ')}` : '',
    job.workMode ? `Work mode: ${job.workMode}` : '',
    criteria.length ? `Criteria:\n${criteria.map((line) => `- ${line}`).join('\n')}` : '',
    leadPromptLine(leadPrompt),
  ]
    .filter(Boolean)
    .join('\n');
}

export type JevQuestion = {
  type: 'boolean';
  instructions: string;
  criteria: { true: string; false: string };
};

/** `promptByUid` holds a lead's criteria prompt per role (LAB-2853); a role without one is absent. */
export function jevQuestions(
  jobs: MatchJob[],
  criteriaByUid: Map<string, string[]>,
  promptByUid: ReadonlyMap<string, string> = new Map()
): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const job of jobs) {
    const criteria = criteriaByUid.get(job.uid) ?? [];
    questions[job.uid] = {
      type: 'boolean',
      instructions: `This person is a credible match for the role below. Most of the criteria are supported by the profile.\n\n${jobBrief(
        job,
        criteria,
        promptByUid.get(job.uid) ?? null
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

/**
 * The note shown with a suggestion of an interested member (LAB-2802): the role note when it is not empty
 * after trim, else the team note, else null.
 */
export function pickInterestNote(
  roleNote: string | null | undefined,
  teamNote: string | null | undefined
): string | null {
  return roleNote?.trim() || teamNote?.trim() || null;
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

export function blurbPrompt(
  job: MatchJob,
  criteria: string[],
  ranked: { member: MatchMember; fit: number }[],
  leadPrompt: string | null = null
): string {
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

${jobBrief(job, criteria, leadPrompt)}

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

/** One earlier weekly email to a lead for a role: which kind, and the members it named. */
export type SentSuggestedEmail = { kind: SuggestedEmailKind; memberUids: readonly string[] };

export type SuggestedEmailKind = 'first' | 'new' | 'reminder';

export type SuggestedEmailPick<T> =
  | { kind: 'first'; candidates: T[] }
  | { kind: 'new'; candidates: T[]; alreadySeenCount: number }
  | { kind: 'reminder'; candidates: T[] };

/**
 * Which weekly suggested-candidates email a lead gets for a role, and who it names (LAB-2837 feedback). `listed` is
 * what the Suggested tab lists for the role from this run, in rank order; "Not looking" members are never named or
 * counted. `history` is this lead's earlier emails for the role, newest first; `contacted` is who a lead of the team
 * has already contacted about the role.
 *
 * - No history: `first`, everyone listed.
 * - Someone listed was never named in any earlier email to this lead: `new`, only them, plus how many listed people
 *   the lead has already seen (contacted ones included — they are still on the page).
 * - Nobody new: a `reminder` of who is listed and not yet contacted — once: not after a reminder, and not when
 *   nobody is left to remind about.
 *
 * Null means no email.
 */
export function pickSuggestedEmail<T extends { memberUid: string }>(args: {
  listed: readonly T[];
  notLooking: ReadonlySet<string>;
  history: readonly SentSuggestedEmail[];
  contacted: ReadonlySet<string>;
}): SuggestedEmailPick<T> | null {
  const eligible = args.listed.filter((item) => !args.notLooking.has(item.memberUid));
  if (!eligible.length) return null;
  if (!args.history.length) return { kind: 'first', candidates: eligible };

  const seen = new Set(args.history.flatMap((email) => email.memberUids));
  const fresh = eligible.filter((item) => !seen.has(item.memberUid));
  if (fresh.length) {
    return { kind: 'new', candidates: fresh, alreadySeenCount: eligible.length - fresh.length };
  }

  if (args.history[0].kind === 'reminder') return null;
  const waiting = eligible.filter((item) => !args.contacted.has(item.memberUid));
  return waiting.length ? { kind: 'reminder', candidates: waiting } : null;
}

/** `JOB_MATCH_EMAIL_TEAM_UIDS` entry that lets every team's leads be emailed. */
export const ALL_EMAIL_TEAMS = '*';

/**
 * `JOB_MATCH_EMAIL_TEAM_UIDS`: comma-separated team uids, trimmed, empties dropped. Unset or empty is nobody;
 * `*` is every team (see `isEmailTeamAllowed`).
 */
export function parseEmailTeamAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );
}

/** Whether the allowlist lets this team's leads be emailed: the team is listed, or `*` is. */
export function isEmailTeamAllowed(allowlist: ReadonlySet<string>, teamUid: string): boolean {
  return allowlist.has(ALL_EMAIL_TEAMS) || allowlist.has(teamUid);
}

/** `JOB_MATCH_EMAIL_DRY_RUN`: on only for the exact string `true`. */
export function isEmailDryRun(value: string | undefined): boolean {
  return value === 'true';
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
