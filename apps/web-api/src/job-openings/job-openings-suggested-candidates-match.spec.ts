import { JobOpeningStatus } from '@prisma/client';
import {
  buildMemberMatchText,
  cosineSimilarity,
  hasMatchableProfile,
  hasWorkedAtTeam,
  isLiveRole,
  labelForScore,
  normalizeCompanyName,
  rankSuggestions,
  scoreCriteria,
  SUGGESTED_CANDIDATES_LIMIT,
} from './job-openings-suggested-candidates-match';

const criteria = (...marks: boolean[]) => marks.map((matched, index) => ({ criterion: `c${index + 1}`, matched }));

describe('suggested candidates match rules', () => {
  describe('isLiveRole', () => {
    it('is live when visible on the board and the role has a team', () => {
      expect(isLiveRole({ status: JobOpeningStatus.NEW, teamUid: 'team-1' })).toBe(true);
      expect(isLiveRole({ status: JobOpeningStatus.CONFIRMED, teamUid: 'team-1' })).toBe(true);
    });

    it('is not live when hidden (stale, closed) or without a team', () => {
      expect(isLiveRole({ status: JobOpeningStatus.STALE, teamUid: 'team-1' })).toBe(false);
      expect(isLiveRole({ status: JobOpeningStatus.CLOSED_ROLE_FILLED, teamUid: 'team-1' })).toBe(false);
      expect(isLiveRole({ status: JobOpeningStatus.NEW, teamUid: null })).toBe(false);
      expect(isLiveRole({ status: null, teamUid: 'team-1' })).toBe(false);
    });
  });

  describe('hasWorkedAtTeam', () => {
    const team = { uid: 'team-1', name: 'Acme Labs' };

    it('excludes a current or former member of the hiring team', () => {
      expect(hasWorkedAtTeam({ experiences: [], teamMemberRoles: [{ teamUid: 'team-1' }] }, team)).toBe(true);
    });

    it('excludes a past experience entry at the team, matched by name ignoring case and spacing', () => {
      expect(hasWorkedAtTeam({ experiences: [{ company: '  acme   LABS ' }], teamMemberRoles: [] }, team)).toBe(true);
    });

    it('keeps members with no history at the team', () => {
      expect(
        hasWorkedAtTeam(
          { experiences: [{ company: 'Acme Labs Inc' }, { company: null }], teamMemberRoles: [{ teamUid: 'team-2' }] },
          team
        )
      ).toBe(false);
    });

    it('never matches an empty company against an empty team name', () => {
      expect(hasWorkedAtTeam({ experiences: [{ company: '' }], teamMemberRoles: [] }, { uid: 't', name: ' ' })).toBe(
        false
      );
    });
  });

  it('normalizeCompanyName trims, lower-cases and collapses whitespace', () => {
    expect(normalizeCompanyName('  Protocol   Labs ')).toBe('protocol labs');
    expect(normalizeCompanyName(null)).toBe('');
  });

  describe('scores and labels', () => {
    it('scores the share of criteria matched', () => {
      expect(scoreCriteria(criteria(true, true, false, false))).toBe(0.5);
      expect(scoreCriteria([])).toBe(0);
    });

    it('labels Strong match from 80%, Good match from 50%, nothing below the floor', () => {
      expect(labelForScore(1)).toBe('STRONG_MATCH');
      expect(labelForScore(0.8)).toBe('STRONG_MATCH');
      expect(labelForScore(0.75)).toBe('GOOD_MATCH');
      expect(labelForScore(0.5)).toBe('GOOD_MATCH');
      expect(labelForScore(0.49)).toBeNull();
    });
  });

  describe('rankSuggestions', () => {
    it('returns exactly 5 when at least 5 qualify, best match first', () => {
      const candidates = [
        { memberUid: 'm1', similarity: 0.9, criteria: criteria(true, false, true, false) },
        { memberUid: 'm2', similarity: 0.5, criteria: criteria(true, true, true, true) },
        { memberUid: 'm3', similarity: 0.8, criteria: criteria(true, true, true, false) },
        { memberUid: 'm4', similarity: 0.7, criteria: criteria(true, true, true, true) },
        { memberUid: 'm5', similarity: 0.6, criteria: criteria(true, true, false, false) },
        { memberUid: 'm6', similarity: 0.4, criteria: criteria(true, true, false, false) },
        { memberUid: 'm7', similarity: 0.3, criteria: criteria(true, true, true, false) },
      ];

      const ranked = rankSuggestions(candidates);

      expect(ranked).toHaveLength(SUGGESTED_CANDIDATES_LIMIT);
      expect(ranked.map((suggestion) => suggestion.memberUid)).toEqual(['m4', 'm2', 'm3', 'm7', 'm1']);
      expect(ranked.map((suggestion) => suggestion.rank)).toEqual([1, 2, 3, 4, 5]);
      expect(ranked[0]).toMatchObject({ score: 1, label: 'STRONG_MATCH' });
      expect(ranked[2]).toMatchObject({ score: 0.75, label: 'GOOD_MATCH' });
    });

    it('drops weak matches and does not pad when fewer qualify', () => {
      const ranked = rankSuggestions([
        { memberUid: 'm1', similarity: 0.9, criteria: criteria(true, false, false, false) },
        { memberUid: 'm2', similarity: 0.8, criteria: criteria(true, true, false, false) },
        { memberUid: 'm3', similarity: 0.7, criteria: criteria(false, false, false, false) },
      ]);

      expect(ranked).toEqual([
        { memberUid: 'm2', rank: 1, score: 0.5, label: 'GOOD_MATCH', criteria: criteria(true, true, false, false) },
      ]);
    });

    it('keeps each criterion with its matched mark', () => {
      const [first] = rankSuggestions([
        { memberUid: 'm1', similarity: 1, criteria: criteria(true, false, true, true) },
      ]);
      expect(first.criteria).toEqual([
        { criterion: 'c1', matched: true },
        { criterion: 'c2', matched: false },
        { criterion: 'c3', matched: true },
        { criterion: 'c4', matched: true },
      ]);
    });
  });

  it('cosineSimilarity handles equal, orthogonal and degenerate vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('builds profile text only from matchable fields', () => {
    const member = {
      name: 'Ada',
      role: 'Engineer',
      bio: null,
      location: { city: 'Lisbon', country: 'Portugal' },
      skills: [{ title: 'Rust' }],
      customSkills: ['libp2p'],
      experiences: [{ title: 'Staff Engineer', company: 'Acme', description: null }],
    };
    expect(hasMatchableProfile(member)).toBe(true);
    expect(buildMemberMatchText(member)).toBe(
      'Role: Engineer\nLocation: Lisbon, Portugal\nSkills: Rust, libp2p\nExperience: Staff Engineer at Acme'
    );
    expect(
      hasMatchableProfile({ ...member, role: null, skills: [], customSkills: [], experiences: [], bio: '  ' })
    ).toBe(false);
  });
});
