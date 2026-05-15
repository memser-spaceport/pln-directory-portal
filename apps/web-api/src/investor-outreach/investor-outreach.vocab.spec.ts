import { parseSectorTagsList } from './investor-outreach.vocab';

describe('investor-outreach.vocab', () => {
  it('accepts empty sector_tags', () => {
    expect(parseSectorTagsList(undefined)).toEqual({ ok: true, value: '' });
    expect(parseSectorTagsList('')).toEqual({ ok: true, value: '' });
  });

  it('normalizes valid comma list', () => {
    expect(parseSectorTagsList(' ai, Saas ')).toEqual({ ok: true, value: 'ai,saas' });
  });

  it('rejects unknown tokens', () => {
    const r = parseSectorTagsList('ai,not-a-tag');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not-a-tag');
  });
});
