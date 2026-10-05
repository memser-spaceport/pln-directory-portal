import { createHash } from 'crypto';
import { JobOpeningStatus } from '@prisma/client';
import { SuggestedCandidateLabel } from 'libs/contracts/src/schema/job-opening';
import { isVisibleStatus } from './job-opening-visibility';

/**
 * Pure rules for suggested candidates (LAB-2770): who may be suggested for a
 * role, how a member's criteria results turn into a score and a label, and
 * the final top-N order. Kept free of Prisma and the AI provider so every rule
 * is testable on plain objects.
 */

/** Suggestions returned per role. */
export const SUGGESTED_CANDIDATES_LIMIT = 5;

/** Members checked against the criteria, taken from the top of the embedding ranking. */
export const SUGGESTED_CANDIDATES_SHORTLIST_SIZE = 15;

/** Share of criteria matched for "Strong match". */
export const STRONG_MATCH_MIN_SCORE = 0.8;

/** Share of criteria matched for "Good match"; anything lower is a weak match and never returned. */
export const GOOD_MATCH_MIN_SCORE = 0.5;

/** A role's suggestions are recomputed at least this often, so profile changes show up within a day. */
export const SUGGESTED_CANDIDATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CriterionResult = { criterion: string; matched: boolean };

export type SuggestionRole = {
  status: JobOpeningStatus | null;
  teamUid: string | null;
};

/** A role is live when it is visible on the board and has a hiring team. */
export function isLiveRole(role: SuggestionRole): boolean {
  return isVisibleStatus(role.status) && role.teamUid != null;
}

/** Trimmed, lower-cased, inner whitespace collapsed: how a free-text company is compared with a team name. */
export function normalizeCompanyName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export type TeamHistoryMember = {
  experiences: Array<{ company: string | null }>;
  teamMemberRoles: Array<{ teamUid: string }>;
};

/**
 * True when the member is or was on the hiring team: any team-member role on
 * it (current or ended), or an experience entry whose company is the team's
 * name. Experience has no team link, so the name is the only signal there.
 */
export function hasWorkedAtTeam(member: TeamHistoryMember, team: { uid: string; name: string }): boolean {
  if (member.teamMemberRoles.some((teamRole) => teamRole.teamUid === team.uid)) return true;
  const teamName = normalizeCompanyName(team.name);
  if (!teamName) return false;
  return member.experiences.some((experience) => normalizeCompanyName(experience.company) === teamName);
}

/** Share of criteria matched, 0 when there are none. */
export function scoreCriteria(results: CriterionResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((result) => result.matched).length / results.length;
}

/** Strong match / Good match, or null below the weak-match floor. */
export function labelForScore(score: number): SuggestedCandidateLabel | null {
  if (score >= STRONG_MATCH_MIN_SCORE) return 'STRONG_MATCH';
  if (score >= GOOD_MATCH_MIN_SCORE) return 'GOOD_MATCH';
  return null;
}

export type CheckedCandidate = {
  memberUid: string;
  /** Embedding similarity to the role; breaks score ties. */
  similarity: number;
  criteria: CriterionResult[];
};

export type RankedSuggestion = {
  memberUid: string;
  rank: number;
  score: number;
  label: SuggestedCandidateLabel;
  criteria: CriterionResult[];
};

/**
 * Drops weak matches, orders by score then similarity (then uid, for a stable
 * order), and keeps the top `limit`. No padding: fewer qualifiers, fewer rows.
 */
export function rankSuggestions(
  candidates: CheckedCandidate[],
  limit: number = SUGGESTED_CANDIDATES_LIMIT
): RankedSuggestion[] {
  return candidates
    .map((candidate) => {
      const score = scoreCriteria(candidate.criteria);
      return { ...candidate, score, label: labelForScore(score) };
    })
    .filter(
      (candidate): candidate is CheckedCandidate & { score: number; label: SuggestedCandidateLabel } =>
        candidate.label !== null
    )
    .sort((a, b) => b.score - a.score || b.similarity - a.similarity || a.memberUid.localeCompare(b.memberUid))
    .slice(0, limit)
    .map((candidate, index) => ({
      memberUid: candidate.memberUid,
      rank: index + 1,
      score: candidate.score,
      label: candidate.label,
      criteria: candidate.criteria,
    }));
}

/** Cosine similarity; 0 for empty, mismatched or zero vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type MatchTextMember = {
  name: string;
  role: string | null;
  bio: string | null;
  location?: { city: string | null; country: string | null } | null;
  skills: Array<{ title: string }>;
  customSkills: string[];
  experiences: Array<{ title: string; company: string | null; description?: string | null }>;
};

/** True when the profile says something matchable: a bio, a role, skills or experience. */
export function hasMatchableProfile(member: MatchTextMember): boolean {
  return Boolean(
    member.bio?.trim() ||
      member.role?.trim() ||
      member.skills.length > 0 ||
      member.customSkills.length > 0 ||
      member.experiences.length > 0
  );
}

const MAX_MATCH_TEXT_LENGTH = 4000;

/** The profile text that is embedded and shown to the criteria check. */
export function buildMemberMatchText(member: MatchTextMember): string {
  const location = [member.location?.city, member.location?.country].filter(Boolean).join(', ');
  const skills = [...member.skills.map((skill) => skill.title), ...member.customSkills].filter(Boolean);
  const lines = [
    member.role ? `Role: ${member.role}` : '',
    location ? `Location: ${location}` : '',
    skills.length > 0 ? `Skills: ${skills.join(', ')}` : '',
    ...member.experiences.map((experience) =>
      [
        `Experience: ${experience.title}`,
        experience.company ? ` at ${experience.company}` : '',
        experience.description ? ` - ${experience.description}` : '',
      ].join('')
    ),
    member.bio ? `Bio: ${member.bio}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, MAX_MATCH_TEXT_LENGTH);
}

export type MatchTextRole = {
  roleTitle: string;
  roleCategory: string | null;
  department: string | null;
  seniority: string | null;
  location: string[];
  workMode: string | null;
  summary: string | null;
  descriptionHtml: string | null;
};

/** The role text the criteria come from and that is embedded for the similarity ranking. */
export function buildRoleMatchText(role: MatchTextRole): string {
  const description = stripHtml(role.descriptionHtml ?? '');
  const lines = [
    `Title: ${role.roleTitle}`,
    role.roleCategory ? `Category: ${role.roleCategory}` : '',
    role.department ? `Department: ${role.department}` : '',
    role.seniority ? `Seniority: ${role.seniority}` : '',
    role.location.length > 0 ? `Location: ${role.location.join(', ')}` : '',
    role.workMode ? `Work mode: ${role.workMode}` : '',
    role.summary ? `Summary: ${role.summary}` : '',
    description ? `Description: ${description}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, MAX_MATCH_TEXT_LENGTH);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short stable hash of a text, to notice when a role or profile changed. */
export function hashMatchText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
