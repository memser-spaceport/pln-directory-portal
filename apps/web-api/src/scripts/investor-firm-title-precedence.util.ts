/**
 * Prefer public/AI prestige enrichment for InvestorOutreachRecord display
 * firm/title; Affinity remains the fallback when enrichment has no usable signal.
 */

export type FirmTitleEnrichmentSignal = {
  firm?: string | null;
  title?: string | null;
  bio?: string | null;
};

export type ResolveInvestorFirmAndTitleInput = {
  affinityFirm: string;
  affinityTitle?: string | null;
  enrichment?: FirmTitleEnrichmentSignal | null;
};

export type ResolveInvestorFirmAndTitleResult = {
  firm: string;
  title: string | null;
  source: 'enrichment' | 'affinity';
};

const ROLE =
  '(?:Co-)?(?:Chief Executive Officer|CEO|President|Managing Director|Managing Partner|General Partner|Partner|Founder|Chairman|Director|Angel Investor|Investor)';

/** Org token chars (no `.` — sentence periods end the match via lookahead). */
const ORG_TOKEN = "[A-Za-z0-9][\\w&'+\\-]*";

/** Org name: stops before punctuation or " and …". */
const ROLE_OF_ORG = new RegExp(
  `\\b(${ROLE})\\s+(?:of|at)\\s+(${ORG_TOKEN}(?:\\s+${ORG_TOKEN})*?)(?=\\s*(?:,|\\.|$|;|\\band\\b))`,
  'gi',
);

const PAST_CUE = /\b(previously|former|formerly|ex-|was|were|used to)\b/i;

function nonEmpty(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

function clausePrefix(bio: string, matchIndex: number): string {
  const before = bio.slice(0, matchIndex);
  const lastBreak = Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('!'));
  return before.slice(lastBreak + 1);
}

function isPastTenseMatch(bio: string, matchIndex: number): boolean {
  return PAST_CUE.test(clausePrefix(bio, matchIndex));
}

/** First present-tense "ROLE of/at ORG" in bio, or null. */
export function extractFirmTitleFromBio(bio: string | null | undefined): { firm: string; title: string } | null {
  const text = nonEmpty(bio);
  if (!text) return null;

  ROLE_OF_ORG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLE_OF_ORG.exec(text)) !== null) {
    if (isPastTenseMatch(text, m.index)) continue;
    const title = nonEmpty(m[1]);
    const firm = nonEmpty(m[2]);
    if (title && firm) return { firm, title };
  }
  return null;
}

/**
 * Display firm/title precedence: structured enrichment → bio extract → Affinity.
 * Does not affect pathfinder proximity (caller keeps Affinity orgs for that).
 */
export function resolveInvestorFirmAndTitle(
  input: ResolveInvestorFirmAndTitleInput,
): ResolveInvestorFirmAndTitleResult {
  const affinityFirm = input.affinityFirm ?? '';
  const affinityTitle = nonEmpty(input.affinityTitle);

  const enrichment = input.enrichment;
  if (!enrichment) {
    return { firm: affinityFirm, title: affinityTitle, source: 'affinity' };
  }

  const structuredFirm = nonEmpty(enrichment.firm);
  const structuredTitle = nonEmpty(enrichment.title);

  if (structuredFirm || structuredTitle) {
    return {
      firm: structuredFirm ?? affinityFirm,
      title: structuredTitle ?? affinityTitle,
      source: 'enrichment',
    };
  }

  const fromBio = extractFirmTitleFromBio(enrichment.bio);
  if (fromBio) {
    return { firm: fromBio.firm, title: fromBio.title, source: 'enrichment' };
  }

  return { firm: affinityFirm, title: affinityTitle, source: 'affinity' };
}
