import { NewsEventType } from '@prisma/client';
import { classifyEventType, classifyText, extractTags, isNoise } from './classify';

describe('isNoise', () => {
  it('rejects "active github"', () => {
    expect(isNoise('GitHub: active github with daily commits')).toBe(true);
  });

  it('rejects "last push" / "last commit"', () => {
    expect(isNoise('Last push: 2 days ago')).toBe(true);
    expect(isNoise('Last commit on main')).toBe(true);
  });

  it('rejects table headers', () => {
    expect(isNoise('| Date | Event | Source |')).toBe(true);
  });

  it('passes substantive news', () => {
    expect(isNoise('Akave raised $5M Series A from Lightspeed in March 2026')).toBe(false);
  });
});

describe('extractTags', () => {
  it('captures funding tags from a $-amount + raised', () => {
    const tags = extractTags('Akave raised $5M Series A in March 2026');
    expect(tags).toEqual(expect.arrayContaining(['$', 'raise']));
  });

  it('captures launch + release tags from "launched v2"', () => {
    const tags = extractTags('Bittensor launched v2.0 mainnet');
    expect(tags).toEqual(expect.arrayContaining(['launch', 'release']));
  });

  it('captures partnership tags', () => {
    const tags = extractTags('Celo announced partnership with Opera');
    expect(tags).toEqual(expect.arrayContaining(['partner', 'announce']));
  });

  it('captures scale tag for big-number user counts', () => {
    expect(extractTags('11M wallets on the network')).toContain('scale');
  });
});

describe('classifyEventType', () => {
  it('maps $/raise/fund/grant to FUNDING', () => {
    expect(classifyEventType(['$', 'raise'])).toBe(NewsEventType.FUNDING);
    expect(classifyEventType(['grant'])).toBe(NewsEventType.FUNDING);
  });

  it('maps launch/deploy/release to LAUNCH', () => {
    expect(classifyEventType(['launch'])).toBe(NewsEventType.LAUNCH);
    expect(classifyEventType(['deploy'])).toBe(NewsEventType.LAUNCH);
    expect(classifyEventType(['release'])).toBe(NewsEventType.LAUNCH);
  });

  it('maps partner/integrate/join to PARTNERSHIP', () => {
    expect(classifyEventType(['partner'])).toBe(NewsEventType.PARTNERSHIP);
    expect(classifyEventType(['integrate'])).toBe(NewsEventType.PARTNERSHIP);
  });

  it('maps announce/publish to ANNOUNCEMENT', () => {
    expect(classifyEventType(['announce'])).toBe(NewsEventType.ANNOUNCEMENT);
    expect(classifyEventType(['publish'])).toBe(NewsEventType.ANNOUNCEMENT);
  });

  it('maps win/scale/acquire/pilot to MILESTONE', () => {
    expect(classifyEventType(['win'])).toBe(NewsEventType.MILESTONE);
    expect(classifyEventType(['acquire'])).toBe(NewsEventType.MILESTONE);
    expect(classifyEventType(['pilot'])).toBe(NewsEventType.MILESTONE);
  });

  it('falls back to OTHER when no recognised tag is present', () => {
    expect(classifyEventType([])).toBe(NewsEventType.OTHER);
    expect(classifyEventType(['unknown-tag'])).toBe(NewsEventType.OTHER);
  });

  it('first-match-wins: $ + partner stays FUNDING', () => {
    expect(classifyEventType(['$', 'partner'])).toBe(NewsEventType.FUNDING);
  });
});

describe('classifyText (end-to-end)', () => {
  it('classifies a real dorothea-style funding bullet', () => {
    const text =
      'Mar 31, 2026 — Akave raised $5M Series A from Lightspeed to scale verifiable storage.';
    const out = classifyText(text);
    expect(out.eventType).toBe(NewsEventType.FUNDING);
    expect(out.tags).toEqual(expect.arrayContaining(['$', 'raise']));
  });

  it('classifies a real dorothea-style partnership bullet', () => {
    const text = 'Apr 16, 2026 — Celo announced partnership with Opera for 160M CELO grant program.';
    const out = classifyText(text);
    expect([NewsEventType.PARTNERSHIP, NewsEventType.FUNDING, NewsEventType.ANNOUNCEMENT]).toContain(
      out.eventType
    );
  });
});
