import { parseSectorTagsList } from './investor-outreach.vocab';

describe('investor-outreach.vocab', () => {
  it('accepts empty sector_tags', () => {
    expect(parseSectorTagsList(undefined)).toEqual({ ok: true, value: '' });
    expect(parseSectorTagsList('')).toEqual({ ok: true, value: '' });
  });

  it('normalizes valid comma list', () => {
    expect(parseSectorTagsList(' ai, Saas ')).toEqual({ ok: true, value: 'ai,saas' });
  });

  it('accepts unknown tokens (free-form storage)', () => {
    expect(parseSectorTagsList('ai,not-a-tag')).toEqual({ ok: true, value: 'ai,not-a-tag' });
  });

  it('splits on comma OR semicolon and normalizes casing', () => {
    expect(parseSectorTagsList('Artificial Intelligence; Blockchain / Web3; Manufacturing AI')).toEqual({
      ok: true,
      value: 'artificial intelligence,blockchain / web3,manufacturing ai',
    });
  });
});
