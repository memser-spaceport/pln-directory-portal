/**
 * Team-lead backfill.
 *
 * Before/alongside the expensive enrichment steps (AI call, ScrapingDog,
 * website scrape), check whether the team's lead members already have data
 * the team needs. Founders and team leads sometimes list a team-shaped email
 * (`info@acme.com`) or social handle (`@acmehq`) on their own Member row —
 * if it structurally matches the TEAM's identity, it's safe to backfill the
 * team's enrichable fields from there.
 *
 * Critically: a lead's personal contact info is NOT copied blindly. Each
 * candidate value goes through the same identity-match guards used by the
 * judge's Stage 1.5 corroboration:
 *
 *   - Email is accepted only when its domain equals the team's website host.
 *     `jane@acme.com` for a team with website `acme.com` → team contact.
 *     `jane@gmail.com` → rejected (personal, not team identity).
 *   - Social handles (twitter / telegram) are accepted only when the handle
 *     starts with a substantive team-name token. `@acmehq` for team "Acme"
 *     → team handle. `@janedoe` → rejected (personal).
 *   - LinkedIn handles are intentionally skipped: a Member's
 *     `linkedinHandler` is always their personal profile (`in/<name>`), never
 *     the team's company page (`company/<slug>`) — the formats don't overlap.
 *
 * Backfill source `team-lead` is recorded on `fieldsMeta[<field>]` with
 * `confidence: high` so the judge's source-trust rule auto-promotes it
 * without an AI call.
 */

import { hostFirstLabelMatchesTeamName } from './team-enrichment-corroboration';

export interface LeadMemberContact {
  email: string | null;
  twitterHandler: string | null;
  linkedinHandler: string | null;
  telegramHandler: string | null;
}

export interface TeamLeadBackfillResult {
  contactMethod?: string;
  twitterHandler?: string;
  telegramHandler?: string;
}

function normalizeHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith('.' + b) || b.endsWith('.' + a);
}

function emailDomain(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^[^\s@]+@([^\s@]+)$/);
  return m ? m[1] : null;
}

/**
 * Returns the leads' email whose domain matches the team's website host, if
 * any. Picks the first match deterministically (lead order from the query).
 * Returns null when no lead has a team-domain email or website is unknown.
 */
function pickTeamEmail(leads: LeadMemberContact[], websiteHost: string | null): string | null {
  if (!websiteHost) return null;
  for (const lead of leads) {
    const email = lead.email?.trim().toLowerCase();
    if (!email) continue;
    const dom = emailDomain(email);
    if (dom && hostsMatch(dom, websiteHost)) return email;
  }
  return null;
}

/**
 * Returns a handle from `field` whose normalized form starts with a
 * substantive team-name token. Reuses the judge's existing prefix-only
 * matcher to avoid the substring-anywhere false-positive class
 * (`beontop` for team "Eon" is rejected because `beontop` doesn't START
 * with `eon` — exactly the same guard the website-host rule uses).
 */
function pickTeamHandle(
  leads: LeadMemberContact[],
  teamName: string,
  field: 'twitterHandler' | 'telegramHandler'
): string | null {
  for (const lead of leads) {
    const raw = lead[field]?.trim();
    if (!raw) continue;
    const candidate = raw.replace(/^@/, '').toLowerCase();
    if (!candidate) continue;
    if (hostFirstLabelMatchesTeamName(teamName, candidate)) return raw;
  }
  return null;
}

/**
 * Derives team-shaped enrichable fields from the team's lead members. Each
 * field is returned ONLY when the lead's value structurally matches the
 * team's identity per the rules in the file header.
 *
 * Caller is responsible for:
 *   - merging the result into the team's candidate values (don't overwrite
 *     existing AI / website-signal / user values),
 *   - stamping `source: 'team-lead'` and `confidence: 'high'` on the
 *     corresponding `fieldsMeta` entries.
 */
export function deriveTeamFieldsFromLeads(
  teamName: string,
  teamWebsite: string | null | undefined,
  leads: LeadMemberContact[]
): TeamLeadBackfillResult {
  if (leads.length === 0) return {};
  const result: TeamLeadBackfillResult = {};
  const websiteHost = normalizeHost(teamWebsite);

  const email = pickTeamEmail(leads, websiteHost);
  if (email) result.contactMethod = email;

  const twitter = pickTeamHandle(leads, teamName, 'twitterHandler');
  if (twitter) result.twitterHandler = twitter.replace(/^@/, '');

  const telegram = pickTeamHandle(leads, teamName, 'telegramHandler');
  if (telegram) result.telegramHandler = telegram.replace(/^@/, '');

  // linkedinHandler intentionally omitted: Member.linkedinHandler is always
  // a personal `in/<name>` profile, never a company page. Backfilling it
  // onto the team would put a person's profile into the team's LinkedIn
  // slot — wrong shape entirely.

  return result;
}
